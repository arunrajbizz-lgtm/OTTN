import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { 
  Tv, Film, Radio, History, Settings as SettingsIcon, Search, Heart, 
  Play, Pause, Info, Clock, Star, AlertCircle, ChevronRight, 
  Maximize, Volume2, Subtitles, FastForward, Rewind, Check, Layout
} from "lucide-react";
import "./style.css";

const BACKEND = "https://ottn-production.up.railway.app";

const MENU = [
  { id: "Live streams", icon: Tv, label: "Live TV" },
  { id: "Media library", icon: Film, label: "Movies & VOD" },
  { id: "Shows archive", icon: History, label: "Catch Up" },
  { id: "Radio stations", icon: Radio, label: "Radio" },
  { id: "Favorites", icon: Heart, label: "My List" },
  { id: "Search", icon: Search, label: "Search" },
  { id: "Settings", icon: SettingsIcon, label: "Settings" }
];

const titleOf = (x) => x?.title || x?.name || x?.o_name || x?.fname || x?.tv_genre_name || x?.category_name || x?.genre_title || "No name";
const idOf = (x) => x?.id || x?.category_id || x?.genre_id || x?.tv_genre_id || x?.alias || "*";
const cmdOf = (x) => x?.cmd || x?.cmd_1 || x?.url || x?.stream_url || x?.file || x?.cmds?.[0]?.url || "";
const thumbOf = (it) => it?.screenshot || it?.logo || it?.tv_genre_logo || "";

/**
 * Native Samsung AVPlay Optimized Wrapper
 */
const AVPlayer = {
  isAvailable: !!(window.webapis && window.webapis.avplay),
  state: "IDLE",
  ratio: "FIT",
  
  init: function() {
    if (!this.isAvailable) return;
    const keys = ["MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward"];
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
        onerror: () => onStatus("Error"),
        onpreparecomplete: () => { window.webapis.avplay.play(); this.state = "PLAYING"; },
        oncurrentplaytime: (t) => onProgress(t, window.webapis.avplay.getDuration())
      });
      window.webapis.avplay.prepareAsync();
    } catch(e){ onStatus("Error: " + e.message); }
  },

  stop: function() { if(this.isAvailable){ window.webapis.avplay.stop(); this.state = "IDLE"; } },
  pause: function() { if(this.isAvailable && this.state === "PLAYING"){ window.webapis.avplay.pause(); this.state = "PAUSED"; } },
  resume: function() { if(this.isAvailable && this.state === "PAUSED"){ window.webapis.avplay.play(); this.state = "PLAYING"; } },
  seek: function(ms) { if(this.isAvailable) try { window.webapis.avplay.jumpForward(ms); } catch(e){} },
  setRatio: function(m) {
    if(!this.isAvailable) return;
    this.ratio = m;
    try { window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080); } catch(e){}
  }
};

/**
 * Simple Storage Cache
 */
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
  const [editingProvider, setEditingProvider] = useState(null);
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem("favs") || "[]"));

  // Player UI
  const [overlay, setOverlay] = useState(false);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const overlayTimer = useRef(null);

  // Core Navigation
  const [navZone, setNavZone] = useState("menu");
  const [focusIndex, setFocusIndex] = useState(0);
  const lastFocus = useRef({});

  useEffect(() => {
    AVPlayer.init();
    loadSection("Live streams");
    api("/api/providers").then(j => { if(j.ok) setProviders(j.providers); });
  }, []);

  const showOverlay = useCallback(() => {
    setOverlay(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => { if(navZone !== "player") setOverlay(false); }, 5000);
  }, [navZone]);

  const api = async (p, method = "GET", body = null) => {
    try {
      const r = await fetch(BACKEND + p, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
      });
      return await r.json();
    } catch(e) { return { ok: false, error: e.message }; }
  };

  const loadSection = useCallback(async (sec) => {
    setSection(sec);
    setCategories([]);
    setItems([]);
    setSelectedCat(null);
    setSelectedItem(null);
    setIsPlaying(false);
    AVPlayer.stop();
    setStatus("Ready");
    
    // Switch navigation to the appropriate zone
    if (sec === "Settings") { setNavZone("items"); setFocusIndex(0); return; }
    if (sec === "Favorites") { setItems(favorites); setNavZone("items"); setFocusIndex(0); return; }
    if (sec === "Search") { setNavZone("items"); setFocusIndex(0); setStatus("Type to search..."); return; }

    // Check Cache
    const cached = Cache.get(sec);
    if (cached) {
      setCategories(cached);
      setNavZone("categories");
      setFocusIndex(0);
      setStatus(`Loaded ${sec} (Cached)`);
      return;
    }

    setStatus(`Loading ${sec}...`);
    let path = "/api/live-categories";
    if (sec === "Shows archive") path = "/api/archive-categories";
    if (sec === "Media library") path = "/api/media-library";
    if (sec === "Radio stations") path = "/api/radio";

    const j = await api(path);
    if (j.ok) {
      const data = j.data || [];
      setCategories(data);
      Cache.set(sec, data);
      setNavZone("categories");
      setFocusIndex(0);
      setStatus(`Loaded ${data.length} categories`);
    } else {
      setStatus("Error: " + j.error);
    }
  }, [favorites]);

  const loadItems = useCallback(async (cat) => {
    setSelectedCat(cat);
    setItems([]);
    setStatus("Loading content...");
    const id = idOf(cat);
    const cKey = `${section}_${id}`;
    const cached = Cache.get(cKey);
    if (cached) {
      setItems(cached);
      setNavZone("items");
      setFocusIndex(0);
      return;
    }

    let path = `/api/live-channels?genre=${encodeURIComponent(id)}`;
    if (section === "Shows archive") path = `/api/archive-list?genre=${encodeURIComponent(id)}`;
    if (section === "Media library") path = `/api/vod-list?category=${encodeURIComponent(id)}`;
    if (section === "Radio stations") path = `/api/radio-list?genre=${encodeURIComponent(id)}`;

    const j = await api(path);
    if (j.ok) {
      const data = j.data || [];
      setItems(data);
      Cache.set(cKey, data);
      setNavZone("items");
      setFocusIndex(0);
      setStatus("Ready");
    }
  }, [section]);

  const playItem = useCallback(async (item) => {
    if (!item) return;
    setSelectedItem(item);
    setStatus("Connecting...");
    let type = (section === "Media library") ? "vod" : "itv";
    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmdOf(item))}`);
    if (j.ok && j.url) {
      setIsPlaying(true);
      setIsPaused(false);
      showOverlay();
      AVPlayer.play(j.url, setStatus, (c, d) => setProgress({ current: c, duration: d }));
    } else {
      setStatus("Failed to get stream");
    }
  }, [section, showOverlay]);

  const updateProvider = async (p, activate = false) => {
    setStatus("Saving...");
    const res = await api("/api/update-provider", "POST", p);
    if (res.ok) {
      if (activate) {
        await api("/api/select-provider", "POST", { id: p.id });
        Cache.clear();
        window.location.reload();
      } else {
        setEditingProvider(null);
        const j = await api("/api/providers");
        if(j.ok) setProviders(j.providers);
        setStatus("Saved");
      }
    }
  };

  // Remote Input Handling (HIGHLY OPTIMIZED)
  useEffect(() => {
    const handleKey = (e) => {
      const key = e.keyCode || e.which;
      const name = e.keyName || "";
      showOverlay();

      // BACK logic
      if (key === 10009 || key === 27) {
        if (editingProvider) { setEditingProvider(null); return; }
        if (overlay && navZone === "player") { setNavZone("items"); setOverlay(false); return; }
        if (isPlaying) { AVPlayer.stop(); setIsPlaying(false); return; }
        if (navZone === "items") { setNavZone(section === "Settings" || section === "Favorites" ? "menu" : "categories"); return; }
        if (navZone === "categories") { setNavZone("menu"); return; }
        return;
      }

      // Counts for zones
      let max = 0;
      if (navZone === "menu") max = MENU.length;
      if (navZone === "categories") max = (categories?.length || 0) + (section !== "Shows archive" ? 1 : 0);
      if (navZone === "items") {
        if (section === "Settings") max = editingProvider ? 10 : (providers?.length || 0) + 1;
        else max = items?.length || 0;
      }
      if (navZone === "player") max = 6;

      switch(key) {
        case 38: setFocusIndex(p => Math.max(0, p - 1)); break; // UP
        case 40: setFocusIndex(p => Math.min(max - 1, p + 1)); break; // DOWN
        case 37: // LEFT
          if (navZone === "items") setNavZone(section === "Settings" || section === "Favorites" ? "menu" : "categories");
          else if (navZone === "categories") setNavZone("menu");
          else if (navZone === "player") setNavZone("items");
          break;
        case 39: // RIGHT
          if (navZone === "menu") {
             if (section === "Settings" || section === "Favorites") setNavZone("items");
             else if (categories?.length > 0) setNavZone("categories");
          } else if (navZone === "categories") {
             if (items?.length > 0) setNavZone("items");
          } else if (navZone === "items" && isPlaying) {
             setNavZone("player");
             setFocusIndex(0);
          }
          break;
        case 13: // ENTER
          if (navZone === "menu") loadSection(MENU[focusIndex].id);
          else if (navZone === "categories") {
            const hasAll = section !== "Shows archive";
            if (hasAll && focusIndex === 0) loadItems({ id: "*", title: "All" });
            else loadItems(categories[hasAll ? focusIndex - 1 : focusIndex]);
          } else if (navZone === "items") {
            if (section === "Settings") {
              if (!editingProvider) {
                if (focusIndex === 0) { Cache.clear(); window.location.reload(); }
                else setEditingProvider(providers[focusIndex - 1]);
              } else {
                const fields = ["name", "portal", "mac", "sn", "deviceId", "deviceId2", "signature"];
                if (focusIndex < 7) {
                  const val = prompt(`Enter ${fields[focusIndex]}`, editingProvider[fields[focusIndex]]);
                  if (val !== null) setEditingProvider({...editingProvider, [fields[focusIndex]]: val});
                } 
                else if (focusIndex === 7) updateProvider(editingProvider);
                else if (focusIndex === 8) updateProvider(editingProvider, true);
                else if (focusIndex === 9) setEditingProvider(null);
              }
            } else playItem(items[focusIndex]);
          } else if (navZone === "player") {
            if (focusIndex === 0) { isPaused ? AVPlayer.resume() : AVPlayer.pause(); setIsPaused(!isPaused); }
            if (focusIndex === 1) AVPlayer.seek(-30000);
            if (focusIndex === 2) AVPlayer.seek(30000);
            if (focusIndex === 3) AVPlayer.setRatio(AVPlayer.ratio === "FIT" ? "FILL" : "FIT");
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navZone, focusIndex, categories, items, section, isPlaying, overlay, editingProvider, providers, isPaused, showOverlay, loadSection, loadItems, playItem]);

  const formatT = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className={`app-shell ${isPlaying ? "video-playing" : ""}`}>
      <nav className={`sidebar ${navZone === "menu" ? "active-zone" : ""}`}>
        <div className="brand"><div className="brand-logo"><Tv color="white" /></div><span>POOMANI TV</span></div>
        <div className="nav-links">
          {MENU.map((m, i) => (
            <div key={m.id} className={`nav-item ${section === m.id ? "current" : ""} ${navZone === "menu" && focusIndex === i ? "focused" : ""}`}>
              <m.icon size={24} /><span>{m.label}</span>
            </div>
          ))}
        </div>
      </nav>

      {categories?.length > 0 && (
        <section className={`cat-panel ${navZone === "categories" ? "active-zone" : ""}`}>
          <div className="panel-header"><h3>Categories</h3></div>
          <div className="scroll-list">
            {section !== "Shows archive" && (
              <div className={`list-row ${selectedCat?.id === "*" ? "active" : ""} ${navZone === "categories" && focusIndex === 0 ? "focused" : ""}`}>All Content</div>
            )}
            {categories.map((c, i) => (
              <div key={i} className={`list-row ${selectedCat === c ? "active" : ""} ${navZone === "categories" && focusIndex === (section !== "Shows archive" ? i + 1 : i) ? "focused" : ""}`}>{titleOf(c)}</div>
            ))}
          </div>
        </section>
      )}

      <main className={`content-area ${navZone === "items" ? "active-zone" : ""}`}>
        <header className="main-header">
           <h1>{section === "Favorites" ? "My List" : (selectedCat ? titleOf(selectedCat) : section)}</h1>
           <div className="status-badge"><Info size={14}/> {status}</div>
        </header>

        <div className="player-wrapper">
          {overlay && isPlaying && (
            <div className={`player-overlay visible ${navZone === "player" ? "active-zone" : ""}`}>
              {section === "Live streams" ? (
                <div className="stb-info-tile">
                   <div className="stb-main">
                      <div className="stb-channel-box">
                        <span className="stb-num">{selectedItem?.number || "0"}</span>
                        {thumbOf(selectedItem) && <img src={thumbOf(selectedItem)} className="stb-logo" />}
                      </div>
                      <div className="stb-content">
                        <h2 className="stb-title">{titleOf(selectedItem)}</h2>
                        <div className="stb-epg-info"><span className="stb-now">NOW:</span> <span className="stb-program">{selectedItem?.epg_progname || "Live TV"}</span></div>
                      </div>
                   </div>
                   <div className="stb-progress-bar"><div className="stb-progress-fill" style={{width: '25%'}}></div></div>
                </div>
              ) : (
                <div className="player-bottom">
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px', fontSize:'20px'}}>
                    <span>{formatT(progress.current)}</span><span>{formatT(progress.duration)}</span>
                  </div>
                  <div className="stb-progress-bar" style={{height:'10px', marginBottom:'30px'}}>
                    <div className="stb-progress-fill" style={{width: `${(progress.current / progress.duration) * 100}%`}}></div>
                  </div>
                  <div className="player-actions">
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 1 ? 'focused' : ''}`}><Rewind size={32}/><span className="action-label">-30s</span></div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 0 ? 'focused' : ''}`}>{isPaused ? <Play size={48}/> : <Pause size={48}/>}</div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 2 ? 'focused' : ''}`}><FastForward size={32}/><span className="action-label">+30s</span></div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 3 ? 'focused' : ''}`}><Maximize size={32}/><span className="action-label">{AVPlayer.ratio}</span></div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 4 ? 'focused' : ''}`}><Volume2 size={32}/><span className="action-label">Audio</span></div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 5 ? 'focused' : ''}`}><Subtitles size={32}/><span className="action-label">CC</span></div>
                  </div>
                </div>
              )}
            </div>
          )}
          {!isPlaying && <div className="player-empty"><Play size={60} color="white" /><span>Select Content</span></div>}
        </div>

        <div className={`items-container ${section === "Live streams" ? "list-mode" : "grid-mode"}`}>
          {section === "Settings" && !editingProvider && (
             <div className="settings-panel">
                <div className={`item-card list-mode ${navZone === "items" && focusIndex === 0 ? "focused" : ""}`} style={{padding:'20px'}}>Refresh Application</div>
                {providers.map((p, i) => (
                  <div key={p.id} className={`item-card list-mode ${p.active ? "active" : ""} ${navZone === "items" && focusIndex === (i+1) ? "focused" : ""}`} style={{padding:'20px'}}>{p.name} {p.active && <Check size={18} color="green" />}</div>
                ))}
             </div>
          )}

          {section === "Settings" && editingProvider && (
             <div className="settings-panel">
                {["Name", "Portal URL", "MAC", "SN", "ID 1", "ID 2", "Sig"].map((f, i) => (
                  <div key={f} className={`item-card list-mode ${navZone === "items" && focusIndex === i ? "focused" : ""}`} style={{padding:'15px'}}>{f}: {Object.values(editingProvider)[i+1] || "(Empty)"}</div>
                ))}
                <div style={{display:'flex', gap:'20px', marginTop:'20px'}}>
                  <div className={`item-card ${navZone === 'items' && focusIndex === 7 ? 'focused' : ''}`} style={{flex:1, padding:'20px', textAlign:'center', background:'#1688f0'}}>SAVE</div>
                  <div className={`item-card ${navZone === 'items' && focusIndex === 8 ? 'focused' : ''}`} style={{flex:1, padding:'20px', textAlign:'center', background:'#2ecc71'}}>ACTIVATE</div>
                  <div className={`item-card ${navZone === 'items' && focusIndex === 9 ? 'focused' : ''}`} style={{flex:1, padding:'20px', textAlign:'center', background:'#e50914'}}>CANCEL</div>
                </div>
             </div>
          )}
          
          {(items || []).map((it, i) => (
            <div key={i} className={`item-card ${selectedItem === it ? "active" : ""} ${navZone === "items" && focusIndex === i ? "focused" : ""}`}>
               {section !== "Live streams" ? (
                 <div className="card-inner"><img src={thumbOf(it) || "https://placehold.co/400x225/000/fff"} /><div className="card-content">{titleOf(it)}</div></div>
               ) : (
                 <div style={{padding:'20px', display:'flex', gap:'20px'}}><span style={{color:'red'}}>{it.number || i+1}</span><b>{titleOf(it)}</b><span style={{opacity:0.5, fontStyle:'italic'}}>{it.epg_progname}</span></div>
               )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);