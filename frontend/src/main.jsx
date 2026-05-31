import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { 
  Tv, Film, Radio, History, Settings as SettingsIcon, Search, Heart, 
  Play, Pause, Info, Clock, AlertCircle, ChevronRight, 
  Maximize, Volume2, Subtitles, FastForward, Rewind, Check
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

const titleOf = (x) => x?.title || x?.name || x?.o_name || x?.fname || x?.tv_genre_name || x?.category_name || x?.genre_title || "No name";
const idOf = (x) => x?.id || x?.category_id || x?.genre_id || x?.tv_genre_id || x?.alias || "*";
const cmdOf = (x) => x?.cmd || x?.cmd_1 || x?.url || x?.stream_url || x?.file || x?.cmds?.[0]?.url || "";
const thumbOf = (it) => it?.screenshot || it?.logo || it?.tv_genre_logo || "";

const AVPlayer = {
  isAvailable: !!(window.webapis && window.webapis.avplay),
  state: "IDLE",
  ratio: "FIT",
  init: function() {
    if (!this.isAvailable) return;
    ["MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward"].forEach(k => {
      try { window.tizen.tvinputdevice.registerKey(k); } catch(e){}
    });
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
  stop: function() { if(this.isAvailable){ window.webapis.avplay.stop(); this.state = "IDLE"; } },
  pause: function() { if(this.isAvailable && this.state === "PLAYING"){ window.webapis.avplay.pause(); this.state = "PAUSED"; } },
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
  const [editingProvider, setEditingProvider] = useState(null);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("favs") || "[]"); } catch(e){ return []; }
  });

  const [overlay, setOverlay] = useState(false);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const overlayTimer = useRef(null);

  const [navZone, setNavZone] = useState("menu");
  const [focusIndex, setFocusIndex] = useState(0);

  const api = useCallback(async (p, method = "GET", body = null) => {
    try {
      const r = await fetch(BACKEND + p, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null
      });
      return await r.json();
    } catch(e) { return { ok: false, error: e.message }; }
  }, []);

  const loadSection = useCallback(async (sec) => {
    setSection(sec);
    setCategories([]);
    setItems([]);
    setSelectedCat(null);
    setSelectedItem(null);
    setIsPlaying(false);
    AVPlayer.stop();
    setFocusIndex(0);
    
    if (sec === "Settings") { 
      setNavZone("items"); 
      setFocusIndex(0); 
      api("/api/providers").then(j => { if(j.ok) setProviders(j.providers || []); });
      return; 
    }
    if (sec === "Favorites") { setItems(favorites); setNavZone("items"); return; }
    if (sec === "Search") { setNavZone("items"); setStatus("Search Mode"); return; }

    const cached = Cache.get(sec);
    if (cached) {
      setCategories(cached);
      setNavZone("categories");
      setStatus("Ready (Cached)");
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
      setNavZone("categories");
      setStatus("Ready");
    } else {
      setStatus("Portal Error");
    }
  }, [favorites, api]);

  const loadItems = useCallback(async (cat) => {
    if (!cat) return;
    setSelectedCat(cat);
    setItems([]);
    setStatus("Loading...");
    const id = idOf(cat);
    const cKey = `${section}_${id}`;
    const cached = Cache.get(cKey);
    if (cached) {
      setItems(cached);
      setNavZone("items");
      setFocusIndex(0);
      return;
    }

    let path = section === "Shows archive" ? `/api/archive-list?genre=${encodeURIComponent(id)}` :
               section === "Media library" ? `/api/vod-list?category=${encodeURIComponent(id)}` :
               section === "Radio stations" ? `/api/radio-list?genre=${encodeURIComponent(id)}` :
               `/api/live-channels?genre=${encodeURIComponent(id)}`;

    const j = await api(path);
    if (j.ok) {
      setItems(j.data || []);
      Cache.set(cKey, j.data || []);
      setNavZone("items");
      setFocusIndex(0);
      setStatus("Ready");
    }
  }, [section, api]);

  const playItem = useCallback(async (item) => {
    if (!item) return;
    setSelectedItem(item);
    setStatus("Connecting...");
    let type = (section === "Media library") ? "vod" : "itv";
    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmdOf(item))}`);
    if (j.ok && j.url) {
      setIsPlaying(true);
      setIsPaused(false);
      setOverlay(true);
      AVPlayer.play(j.url, setStatus, (c, d) => setProgress({ current: c, duration: d }));
    } else {
      setStatus("Stream Error");
    }
  }, [section, api]);

  const showOverlay = useCallback(() => {
    setOverlay(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => { if(navZone !== "player") setOverlay(false); }, 5000);
  }, [navZone]);

  useEffect(() => {
    AVPlayer.init();
    loadSection("Live streams");
    api("/api/providers").then(j => { if(j.ok) setProviders(j.providers || []); });
  }, [api, loadSection]);

  useEffect(() => {
    const handleKey = (e) => {
      const key = e.keyCode || e.which;
      showOverlay();

      if (key === 10009 || key === 27) {
        if (editingProvider) { setEditingProvider(null); setFocusIndex(0); return; }
        if (overlay && navZone === "player") { setNavZone("items"); setOverlay(false); return; }
        if (isPlaying) { AVPlayer.stop(); setIsPlaying(false); return; }
        if (navZone === "items") { 
          if (section === "Settings" || section === "Favorites" || section === "Search") {
            setNavZone("menu"); setFocusIndex(MENU.findIndex(m => m.id === section));
          } else {
            setNavZone("categories"); setFocusIndex(0);
          }
          return;
        }
        if (navZone === "categories") { setNavZone("menu"); setFocusIndex(MENU.findIndex(m => m.id === section)); return; }
        return;
      }

      let max = navZone === "menu" ? MENU.length : 
                navZone === "categories" ? (categories?.length || 0) + (section !== "Shows archive" ? 1 : 0) :
                navZone === "items" ? (section === "Settings" ? (editingProvider ? 10 : (providers?.length || 0) + 1) : (items?.length || 0)) :
                navZone === "player" ? 6 : 0;

      switch(key) {
        case 38: setFocusIndex(p => Math.max(0, p - 1)); break;
        case 40: setFocusIndex(p => Math.min(max - 1, p + 1)); break;
        case 37: 
          if (navZone === "items") { 
            if (section === "Settings" || section === "Favorites" || section === "Search") { setNavZone("menu"); setFocusIndex(MENU.findIndex(m => m.id === section)); }
            else { setNavZone("categories"); setFocusIndex(0); }
          }
          else if (navZone === "categories" || navZone === "player") { setNavZone("menu"); setFocusIndex(MENU.findIndex(m => m.id === section)); }
          break;
        case 39:
          if (navZone === "menu") { 
            if (section === "Settings" || section === "Favorites" || section === "Search") { setNavZone("items"); setFocusIndex(0); }
            else if (categories?.length > 0) { setNavZone("categories"); setFocusIndex(0); }
          }
          else if (navZone === "categories" && items?.length > 0) { setNavZone("items"); setFocusIndex(0); }
          else if (navZone === "items" && isPlaying) { setNavZone("player"); setFocusIndex(0); }
          break;
        case 13:
          if (navZone === "menu") loadSection(MENU[focusIndex].id);
          else if (navZone === "categories") {
            const hasAll = section !== "Shows archive";
            if (hasAll && focusIndex === 0) loadItems({ id: "*", title: "All Content" });
            else loadItems(categories[hasAll ? focusIndex - 1 : focusIndex]);
          } else if (navZone === "items") {
            if (section === "Settings") {
              if (!editingProvider) {
                if (focusIndex === 0) { Cache.clear(); window.location.reload(); }
                else setEditingProvider(providers[focusIndex - 1]);
              } else {
                const fields = ["name", "portal", "mac", "sn", "deviceId", "deviceId2", "signature"];
                if (focusIndex < 7) {
                  const val = prompt(`Enter ${fields[focusIndex]}`, Object.values(editingProvider)[focusIndex+1]);
                  if (val !== null) setEditingProvider({...editingProvider, [fields[focusIndex]]: val});
                } else if (focusIndex === 7) api("/api/update-provider", "POST", editingProvider).then(r => { if(r.ok) setEditingProvider(null); });
                else if (focusIndex === 8) api("/api/update-provider", "POST", editingProvider).then(async () => {
                  await api("/api/select-provider", "POST", { id: editingProvider.id });
                  Cache.clear(); window.location.reload();
                });
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
  }, [navZone, focusIndex, categories, items, section, isPlaying, overlay, editingProvider, providers, isPaused, showOverlay, loadSection, loadItems, playItem, api]);

  const formatT = (ms) => {
    const s = Math.floor((ms || 0) / 1000);
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
        <div style={{padding: '0 40px', opacity: 0.3, fontSize: '18px'}}><Clock size={18} /> {new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
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
           <h1>{selectedCat ? titleOf(selectedCat) : section}</h1>
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
                        {thumbOf(selectedItem) && <img src={thumbOf(selectedItem)} className="stb-logo" alt="" />}
                      </div>
                      <div className="stb-content">
                        <h2 className="stb-title">{titleOf(selectedItem)}</h2>
                        <div className="stb-epg-info"><span className="stb-now">NOW:</span> <span className="stb-program">{selectedItem?.epg_progname || "Live TV Stream"}</span></div>
                      </div>
                   </div>
                   <div className="stb-progress-bar"><div className="stb-progress-fill" style={{width: '35%'}}></div></div>
                </div>
              ) : (
                <div className="player-bottom" style={{width:'100%'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px', fontSize:'24px', fontWeight: 700}}>
                    <span>{formatT(progress.current)}</span><span>{formatT(progress.duration)}</span>
                  </div>
                  <div className="stb-progress-bar" style={{height:'12px', marginBottom:'40px'}}><div className="stb-progress-fill" style={{width: `${(progress.current / progress.duration) * 100}%`}}></div></div>
                  <div className="player-actions">
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 1 ? 'focused' : ''}`}><Rewind size={36}/><span className="action-label">-30s</span></div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 0 ? 'focused' : ''}`}>{isPaused ? <Play size={56}/> : <Pause size={56}/>}</div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 2 ? 'focused' : ''}`}><FastForward size={36}/><span className="action-label">+30s</span></div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 3 ? 'focused' : ''}`}><Maximize size={36}/><span className="action-label">{AVPlayer.ratio}</span></div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 4 ? 'focused' : ''}`}><Volume2 size={36}/><span className="action-label">Audio</span></div>
                    <div className={`action-btn ${navZone === 'player' && focusIndex === 5 ? 'focused' : ''}`}><Subtitles size={36}/><span className="action-label">CC</span></div>
                  </div>
                </div>
              )}
            </div>
          )}
          {!isPlaying && <div className="player-empty"><Play size={80} color="white" /><span>Select Content to Play</span></div>}
        </div>

        <div className={`items-container ${section === "Live streams" ? "list-mode" : "grid-mode"}`}>
          {section === "Settings" && !editingProvider && (
             <div className="settings-panel">
                <div className={`item-card list-mode ${navZone === "items" && focusIndex === 0 ? "focused" : ""}`} style={{padding:'25px', fontSize:'22px', fontWeight: 600}}>Refresh Application Data</div>
                {(providers || []).map((p, i) => (
                  <div key={p.id || i} className={`item-card list-mode ${p.active ? "active" : ""} ${navZone === "items" && focusIndex === (i+1) ? "focused" : ""}`} style={{padding:'25px', display:'flex', justifyContent:'space-between'}}>
                    <span style={{fontSize:'22px', fontWeight: 600}}>{p.name || `Provider ${i+1}`}</span>
                    {p.active ? <Check size={24} color="#2ecc71" /> : <ChevronRight size={24} />}
                  </div>
                ))}
             </div>
          )}
          {section === "Settings" && editingProvider && (
             <div className="settings-panel">
                <h3 style={{color: 'red', marginBottom: '20px'}}>EDITING: {editingProvider.name}</h3>
                {["Name", "Portal URL", "MAC", "SN", "ID 1", "ID 2", "Sig"].map((f, i) => (
                  <div key={f} className={`item-card list-mode ${navZone === "items" && focusIndex === i ? "focused" : ""}`} style={{padding:'20px', fontSize:'20px'}}><span style={{opacity: 0.5, marginRight: '20px'}}>{f}:</span> {Object.values(editingProvider)[i+1] || "(Empty)"}</div>
                ))}
                <div style={{display:'flex', gap:'25px', marginTop:'30px'}}>
                  <div className={`item-card ${navZone === 'items' && focusIndex === 7 ? 'focused' : ''}`} style={{flex:1, padding:'25px', textAlign:'center', background:'#1688f0', color: 'white', fontWeight: 800}}>SAVE</div>
                  <div className={`item-card ${navZone === 'items' && focusIndex === 8 ? 'focused' : ''}`} style={{flex:1, padding:'25px', textAlign:'center', background:'#2ecc71', color: 'white', fontWeight: 800}}>ACTIVATE</div>
                  <div className={`item-card ${navZone === 'items' && focusIndex === 9 ? 'focused' : ''}`} style={{flex:1, padding:'25px', textAlign:'center', background:'#e50914', color: 'white', fontWeight: 800}}>CANCEL</div>
                </div>
             </div>
          )}
          {(items || []).map((it, i) => (
            <div key={i} className={`item-card ${selectedItem === it ? "active" : ""} ${navZone === "items" && focusIndex === i ? "focused" : ""}`} onClick={() => playItem(it)}>
               {section !== "Live streams" ? (
                 <div className="card-inner"><img src={thumbOf(it) || "https://placehold.co/400x225/111/eee?text=No+Poster"} alt="" /><div className="card-content">{titleOf(it)}</div></div>
               ) : (
                 <div style={{padding:'25px', display:'flex', gap:'30px', alignItems:'center'}}><span style={{color:'red', fontSize:'24px', fontWeight: 900, minWidth: '60px'}}>{it.number || i+1}</span><b style={{fontSize:'24px', flex: 1}}>{titleOf(it) || "No name"}</b><span style={{opacity:0.6, fontStyle:'italic', fontSize:'20px'}}>{it.epg_progname}</span></div>
               )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);