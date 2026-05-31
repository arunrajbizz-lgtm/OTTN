import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { 
  Tv, Film, Radio, History, Settings as SettingsIcon, Search, Heart, 
  Play, Pause, Info, Clock, AlertCircle, ChevronRight, 
  Maximize, Volume2, Subtitles, FastForward, Rewind, Check, List, Layers, 
  Calendar, Star, Clapperboard, RotateCcw, RotateCw, PlayCircle
} from "lucide-react";
import "./style.css";

const BACKEND = "https://ottn-production.up.railway.app"; 

const MENU = [
  { id: "Live streams", icon: Tv, label: "Live streams" },
  { id: "Shows archive", icon: History, label: "Shows archive" },
  { id: "Media library", icon: Film, label: "Media library" },
  { id: "Radio stations", icon: Radio, label: "Radio stations" },
  { id: "Search", icon: Search, label: "Search" },
  { id: "Favorites", icon: Heart, label: "Favorites" },
  { id: "Settings", icon: SettingsIcon, label: "Settings" }
];

const titleOf = (x) => {
  if (typeof x === 'string') return x;
  return x?.title || x?.name || x?.o_name || x?.fname || x?.tv_genre_name || x?.category_name || x?.genre_title || "No name";
};
const idOf = (x) => x?.id || x?.category_id || x?.genre_id || x?.tv_genre_id || x?.alias || "*";
const cmdOf = (x) => x?.cmd || x?.cmd_1 || x?.url || x?.stream_url || x?.file || x?.cmds?.[0]?.url || "";
const thumbOf = (it) => it?.screenshot || it?.logo || it?.tv_genre_logo || it?.poster || "";

const AVPlayer = {
  isAvailable: !!(window.webapis && window.webapis.avplay),
  state: "IDLE",
  ratio: "FIT",
  init: function() {
    if (!this.isAvailable) return;
    const keys = ["MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "ChannelUp", "ChannelDown", "VolumeUp", "VolumeDown", "VolumeMute", "Info", "Guide", "Search", "Menu", "Source", "ColorRed", "ColorGreen", "ColorYellow", "ColorBlue"];
    keys.forEach(k => { try { window.tizen.tvinputdevice.registerKey(k); } catch(e){} });
  },
  play: function(url, onStatus, onProgress) {
    if (!this.isAvailable) return;
    try {
      this.stop();
      window.webapis.avplay.open(url);
      window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      window.webapis.avplay.setListener({
        onbufferingstart: () => onStatus("Buffering..."),
        onbufferingcomplete: () => onStatus("Playing"),
        onstreamcompleted: () => { this.state = "IDLE"; onStatus("Finished"); },
        onerror: () => onStatus("Playback Error"),
        onpreparecomplete: () => { window.webapis.avplay.play(); this.state = "PLAYING"; },
        oncurrentplaytime: (t) => onProgress(t, window.webapis.avplay.getDuration())
      });
      window.webapis.avplay.prepareAsync();
    } catch(e){ onStatus("Error: " + e.message); }
  },
  stop: function() { if(this.isAvailable){ try { window.webapis.avplay.stop(); } catch(e){} this.state = "IDLE"; } },
  pause: function() { if(this.isAvailable && (this.state === "PLAYING" || this.state === "RESUMED")){ window.webapis.avplay.pause(); this.state = "PAUSED"; } },
  resume: function() { if(this.isAvailable && this.state === "PAUSED"){ window.webapis.avplay.play(); this.state = "PLAYING"; } },
  seek: function(ms) { if(this.isAvailable) try { window.webapis.avplay.jumpForward(ms); } catch(e){} },
  setRatio: function(m) {
    this.ratio = m;
    if(!this.isAvailable) return;
    try { window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080); } catch(e){}
  }
};

const Cache = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(`c_${k}`)); } catch(e){ return null; } },
  set: (k, v) => { try { localStorage.setItem(`c_${k}`, JSON.stringify(v)); } catch(e){} },
  clear: () => { Object.keys(localStorage).forEach(k => { if(k.startsWith("c_")) localStorage.removeItem(k); }); }
};

function App() {
  const [section, setSection] = useState("Live streams");
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [isPlaying, setIsPlaying] = useState(false);
  const [providers, setProviders] = useState([]);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("favs") || "[]"); } catch(e){ return []; }
  });

  const [seriesData, setSeriesData] = useState(null);
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);

  const [overlay, setOverlay] = useState(false);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const overlayTimer = useRef(null);

  const [navZone, setNavZone] = useState("menu");
  const [focusIndex, setFocusIndex] = useState(0);

  const zoneIndices = useRef({ menu: 0, categories: 0, items: 0, seasons: 0, episodes: 0, player: 0 });

  const updateFocus = useCallback((zone, idx) => {
    zoneIndices.current[zone] = idx;
    if (navZone === zone) setFocusIndex(idx);
  }, [navZone]);

  const switchZone = useCallback((newZone) => {
    console.log(`[Nav] Switching to zone: ${newZone}`);
    setNavZone(newZone);
    setFocusIndex(zoneIndices.current[newZone] || 0);
  }, []);

  const api = useCallback(async (p, method = "GET", body = null) => {
    try {
      const r = await fetch(BACKEND + p, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
      });
      return await r.json();
    } catch(e) { 
      return { ok: false, error: "Connection Failed" }; 
    }
  }, []);

  const loadSection = useCallback(async (sec) => {
    setSection(sec); setCategories([]); setItems([]); setSelectedCat(null); setSelectedItem(null);
    setIsPlaying(false); setSeriesData(null); AVPlayer.stop();
    
    zoneIndices.current = { menu: zoneIndices.current.menu, categories: 0, items: 0, seasons: 0, episodes: 0, player: 0 };

    if (sec === "Settings") { 
      switchZone("items");
      api("/api/providers").then(j => { if(j.ok) setProviders(j.providers || []); });
      return; 
    }
    if (sec === "Favorites") { setItems(favorites); switchZone("items"); return; }
    
    const cached = Cache.get(sec);
    if (cached) {
      setCategories(cached);
      switchZone("categories");
      setStatus("Ready");
      return;
    }

    setStatus(`Loading ${sec}...`);
    let path = sec === "Shows archive" ? "/api/archive-categories" : 
               sec === "Media library" ? "/api/media-library" : 
               sec === "Radio stations" ? "/api/radio" : "/api/live-categories";

    const j = await api(path);
    if (j.ok) {
      setCategories(j.data || []);
      Cache.set(sec, j.data || []);
      switchZone("categories");
      setStatus("Ready");
    } else { setStatus("Portal Error"); }
  }, [favorites, api, switchZone]);

  const loadItems = useCallback(async (cat) => {
    if (!cat) return;
    setSelectedCat(cat); setItems([]); setStatus(`Loading items...`);
    const id = idOf(cat);
    const cKey = `${section}_${id}`;
    
    const j = await api(section === "Shows archive" ? `/api/archive-list?genre=${encodeURIComponent(id)}` :
               section === "Media library" ? `/api/vod-list?category=${encodeURIComponent(id)}` :
               section === "Radio stations" ? `/api/radio-list?genre=${encodeURIComponent(id)}` :
               `/api/live-channels?genre=${encodeURIComponent(id)}`);

    if (j.ok) {
      const data = j.data || [];
      setItems(data);
      Cache.set(cKey, data);
      switchZone("items");
      setStatus(data.length > 0 ? "Ready" : "No items");
    } else { setStatus("Portal Error"); }
  }, [section, api, switchZone]);

  const playItem = useCallback(async (item) => {
    if (!item || typeof item === 'string') return;
    setSelectedItem(item);
    setStatus("Connecting...");
    let type = (section === "Media library") ? "vod" : "itv";
    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmdOf(item))}`);
    if (j.ok && j.url) {
      setIsPlaying(true); setOverlay(true);
      switchZone("player");
      AVPlayer.play(j.url, setStatus, (c, d) => setProgress({ current: c, duration: d }));
    } else { setStatus("Stream Error"); }
  }, [section, api, switchZone]);

  useEffect(() => {
    AVPlayer.init();
    loadSection("Live streams");
  }, [loadSection]);

  useEffect(() => {
    const handleKey = (e) => {
      const key = e.keyCode || e.which;
      setOverlay(true);
      console.log(`[Key] ${key} in ${navZone}`);

      if ([37, 38, 39, 40, 13, 10009, 27].includes(key)) e.preventDefault();

      if (key === 10009 || key === 27) { // Back
        if (isPlaying) { AVPlayer.stop(); setIsPlaying(false); switchZone("items"); return; }
        if (navZone === "items") { switchZone("categories"); return; }
        if (navZone === "categories") { switchZone("menu"); return; }
        return;
      }

      let max = navZone === "menu" ? MENU.length : 
                navZone === "categories" ? (categories?.length || 0) + (section !== "Shows archive" ? 1 : 0) :
                navZone === "items" ? (items?.length || 0) :
                navZone === "player" ? 4 : 0;

      switch(key) {
        case 38: setFocusIndex(p => { const n = Math.max(0, p - 1); zoneIndices.current[navZone] = n; return n; }); break;
        case 40: setFocusIndex(p => { const n = Math.min(max - 1, p + 1); zoneIndices.current[navZone] = n; return n; }); break;
        case 37: // Left
           if (navZone === "items") switchZone("categories");
           else if (navZone === "categories") switchZone("menu");
           break;
        case 39: // Right
           if (navZone === "menu") switchZone("categories");
           else if (navZone === "categories") switchZone("items");
           break;
        case 13: // Enter
          if (navZone === "menu") loadSection(MENU[focusIndex].id);
          else if (navZone === "categories") {
            const hasAll = section !== "Shows archive";
            if (hasAll && focusIndex === 0) loadItems({ id: "*", title: "All Content" });
            else loadItems(categories[hasAll ? focusIndex - 1 : focusIndex]);
          } else if (navZone === "items") {
            playItem(items[focusIndex]);
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navZone, focusIndex, categories, items, section, isPlaying, loadSection, loadItems, playItem, switchZone]);

  useEffect(() => {
    const focused = document.querySelector('.focused');
    if (focused) focused.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  }, [focusIndex, navZone]);

  return (
    <div className={`app-shell ${isPlaying ? "video-playing" : ""}`}>
      <nav className={`sidebar ${navZone === "menu" ? "active-zone" : ""}`}>
        <div className="brand"><span>POOMANI TV</span></div>
        <div className="nav-links">
          {MENU.map((m, i) => (
            <div key={m.id} className={`nav-item ${section === m.id ? "current" : ""} ${navZone === "menu" && focusIndex === i ? "focused" : ""}`}>
              <m.icon size={24} /><span>{m.label}</span>
            </div>
          ))}
        </div>
      </nav>

      {categories.length > 0 && (
        <section className={`cat-panel ${navZone === "categories" ? "active-zone" : ""}`}>
          <div className="scroll-list">
            {section !== "Shows archive" && (
              <div className={`list-row ${navZone === "categories" && focusIndex === 0 ? "focused" : ""}`}>All Content</div>
            )}
            {categories.map((c, i) => (
              <div key={i} className={`list-row ${navZone === "categories" && focusIndex === (section !== "Shows archive" ? i + 1 : i) ? "focused" : ""}`}>{titleOf(c)}</div>
            ))}
          </div>
        </section>
      )}

      <main className={`content-area ${navZone === "items" ? "active-zone" : ""}`}>
        <header className="main-header">
           <h1>{selectedCat ? titleOf(selectedCat) : section}</h1>
           <div className="status-badge">{status} | {navZone} [{focusIndex}]</div>
        </header>

        <div className={`items-container ${section === "Live streams" ? "list-mode" : "grid-mode"}`}>
          {items.map((it, i) => (
            <div key={i} className={`item-card ${navZone === "items" && focusIndex === i ? "focused" : ""}`}>
               {section === "Live streams" ? (
                 <div className="live-row"><span className="ch-num">{i+1}</span><b className="ch-title">{titleOf(it)}</b></div>
               ) : (
                 <div className="card-inner"><img src={thumbOf(it)} alt="" /><div className="card-content">{titleOf(it)}</div></div>
               )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);