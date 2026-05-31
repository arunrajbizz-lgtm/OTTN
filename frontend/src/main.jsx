import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { 
  Tv, Film, Radio, History, Settings as SettingsIcon, Search, Heart, 
  Play, Pause, Info, Clock, AlertCircle, ChevronRight, 
  Maximize, Volume2, Subtitles, FastForward, Rewind, Check, List, Layers, 
  Calendar, Star, Clapperboard, RotateCcw, RotateCw, PlayCircle, SkipBack, SkipForward
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
    console.log("[AVPlayer] Playing URL:", url);
    try {
      this.stop();
      window.webapis.avplay.open(url);
      window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      window.webapis.avplay.setListener({
        onbufferingstart: () => { console.log("Buffering..."); onStatus("Buffering..."); },
        onbufferingcomplete: () => { console.log("Buffering complete"); onStatus("Playing"); },
        onstreamcompleted: () => { console.log("Stream completed"); this.state = "IDLE"; onStatus("Finished"); },
        onerror: (e) => { console.error("Player Error:", e); onStatus("Playback Error: " + e); },
        onpreparecomplete: () => { 
          console.log("Prepare complete"); 
          window.webapis.avplay.play(); 
          this.state = "PLAYING"; 
          onStatus("Playing");
        },
        oncurrentplaytime: (t) => onProgress(t, window.webapis.avplay.getDuration())
      });
      window.webapis.avplay.prepareAsync();
    } catch(e){ 
      console.error("[AVPlayer] Exception:", e);
      onStatus("Error: " + e.message); 
    }
  },
  stop: function() { 
    if(this.isAvailable){ 
      try { 
        window.webapis.avplay.stop(); 
        console.log("[AVPlayer] Stopped");
      } catch(e){} 
      this.state = "IDLE"; 
    } 
  },
  pause: function() { 
    if(this.isAvailable && (this.state === "PLAYING" || this.state === "RESUMED")){ 
      window.webapis.avplay.pause(); 
      this.state = "PAUSED"; 
    } 
  },
  resume: function() { 
    if(this.isAvailable && this.state === "PAUSED"){ 
      window.webapis.avplay.play(); 
      this.state = "PLAYING"; 
    } 
  },
  seek: function(ms) { 
    if(this.isAvailable) try { window.webapis.avplay.jumpForward(ms); } catch(e){} 
  },
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

  const showOverlay = useCallback(() => {
    setOverlay(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => { if(isPlaying && navZone !== "player") setOverlay(false); }, 5000);
  }, [isPlaying, navZone]);

  useEffect(() => {
    const handleKey = (e) => {
      const key = e.keyCode || e.which;
      showOverlay();
      console.log(`[Key] ${key} in ${navZone}`);

      // Basic Nav and Player Controls
      if ([37, 38, 39, 40, 13, 10009, 27, 415, 19, 413, 412, 417, 427, 428, 447, 448, 10153, 403, 404, 405, 406].includes(key)) {
        e.preventDefault();
      }

      if (key === 10009 || key === 27) { // Back
        if (isPlaying) { AVPlayer.stop(); setIsPlaying(false); switchZone("items"); return; }
        if (navZone === "items") { switchZone("categories"); return; }
        if (navZone === "categories") { switchZone("menu"); return; }
        return;
      }

      // Tizen Specific Key Logic
      switch(key) {
        case 447: // Vol Up
          try { window.tizen.tvaudio.setVolume(Math.min(100, window.tizen.tvaudio.getVolume() + 1)); } catch(e){}
          break;
        case 448: // Vol Down
          try { window.tizen.tvaudio.setVolume(Math.max(0, window.tizen.tvaudio.getVolume() - 1)); } catch(e){}
          break;
        case 10153: // Mute
          try { window.tizen.tvaudio.setMute(!window.tizen.tvaudio.isMute()); } catch(e){}
          break;
        case 427: // CH Up
          if (navZone === "items" && focusIndex < items.length - 1) {
             setFocusIndex(p => p + 1);
             if (isPlaying) playItem(items[focusIndex + 1]);
          }
          break;
        case 428: // CH Down
          if (navZone === "items" && focusIndex > 0) {
             setFocusIndex(p => p - 1);
             if (isPlaying) playItem(items[focusIndex - 1]);
          }
          break;
        case 415: case 19: // Play/Pause
          if (isPlaying) { isPaused ? AVPlayer.resume() : AVPlayer.pause(); setIsPaused(!isPaused); }
          break;
        case 413: // Stop
          if (isPlaying) { AVPlayer.stop(); setIsPlaying(false); switchZone("items"); }
          break;
        case 412: if (isPlaying) AVPlayer.seek(-30000); break; // RW
        case 417: if (isPlaying) AVPlayer.seek(30000); break; // FF
        case 403: console.log("Red Button"); break;
        case 404: console.log("Green Button"); break;
        case 405: console.log("Yellow Button"); break;
        case 406: console.log("Blue Button"); break;
      }

      let max = navZone === "menu" ? MENU.length : 
                navZone === "categories" ? (categories?.length || 0) + (section !== "Shows archive" ? 1 : 0) :
                navZone === "items" ? (items?.length || 0) :
                navZone === "player" ? 4 : 0;

      switch(key) {
        case 38: setFocusIndex(p => { const n = Math.max(0, p - 1); zoneIndices.current[navZone] = n; return n; }); break; // Up
        case 40: setFocusIndex(p => { const n = Math.min(max - 1, p + 1); zoneIndices.current[navZone] = n; return n; }); break; // Down
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
          } else if (navZone === "player") {
             if (focusIndex === 0) { isPaused ? AVPlayer.resume() : AVPlayer.pause(); setIsPaused(!isPaused); }
             if (focusIndex === 1) AVPlayer.seek(-30000);
             if (focusIndex === 2) AVPlayer.seek(30000);
             if (focusIndex === 3) { AVPlayer.stop(); setIsPlaying(false); switchZone("items"); }
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navZone, focusIndex, categories, items, section, isPlaying, isPaused, loadSection, loadItems, playItem, switchZone, showOverlay]);

  useEffect(() => {
    const focused = document.querySelector('.focused');
    if (focused) focused.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  }, [focusIndex, navZone]);

  const formatT = (ms) => {
    const s = Math.floor((ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className={`app-shell ${isPlaying ? "video-playing" : ""}`}>
      <nav className={`sidebar ${navZone === "menu" ? "active-zone" : ""}`}>
        <div className="active-zone-indicator"></div>
        <div className="brand"><span>POOMANI TV</span></div>
        <div className="nav-links">
          {MENU.map((m, i) => (
            <div key={m.id} className={`nav-item ${section === m.id ? "current" : ""} ${navZone === "menu" && focusIndex === i ? "focused" : ""}`}>
              <m.icon size={32} /><span>{m.label}</span>
            </div>
          ))}
        </div>
      </nav>

      {categories.length > 0 && (
        <section className={`cat-panel ${navZone === "categories" ? "active-zone" : ""}`}>
          <div className="active-zone-indicator"></div>
          <div className="panel-header"><h3>{section}</h3></div>
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
        <div className="active-zone-indicator"></div>
        <header className="main-header">
           <h1>{selectedCat ? titleOf(selectedCat) : section}</h1>
           <div className="status-badge">{status} | {navZone} [{focusIndex}]</div>
        </header>

        <div className={`items-container ${section === "Live streams" ? "list-mode" : "grid-mode"}`}>
          {items.map((it, i) => (
            <div key={i} className={`item-card ${section === "Live streams" ? "list-mode" : ""} ${navZone === "items" && focusIndex === i ? "focused" : ""}`}>
               {section === "Live streams" ? (
                 <div className="live-row"><span className="ch-num">{i+1}</span><b className="ch-title">{titleOf(it)}</b></div>
               ) : (
                 <div className="card-inner">
                    <img src={thumbOf(it)} alt="" />
                    <div className="card-content">{titleOf(it)}</div>
                 </div>
               )}
            </div>
          ))}
        </div>
      </main>

      <div className={`full-player-ui ${isPlaying && overlay ? "visible" : ""}`}>
          <div className="player-header">
             <h1 className="player-title">{titleOf(selectedItem)}</h1>
          </div>
          <div className="player-controls-container">
              <div className="progress-track">
                 <div className="progress-fill" style={{width: `${(progress.current / (progress.duration || 1)) * 100}%`}}></div>
              </div>
              <div className="player-times">
                 <span>{formatT(progress.current)}</span>
                 <span>{formatT(progress.duration)}</span>
              </div>
              <div className="player-actions">
                  <div className={`player-btn ${navZone === "player" && focusIndex === 0 ? "focused" : ""}`}>
                     {isPaused ? <Play size={80} fill="white"/> : <Pause size={80} fill="white"/>}
                  </div>
                  <div className={`player-btn ${navZone === "player" && focusIndex === 1 ? "focused" : ""}`}><SkipBack size={60} /></div>
                  <div className={`player-btn ${navZone === "player" && focusIndex === 2 ? "focused" : ""}`}><SkipForward size={60} /></div>
                  <div className={`player-btn ${navZone === "player" && focusIndex === 3 ? "focused" : ""}`}><AlertCircle size={60} /></div>
              </div>
          </div>
      </div>

      {isPlaying && (status === "Buffering..." || status.includes("Error") || status === "Connecting...") && (
         <div className="playback-status-center">{status}</div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);