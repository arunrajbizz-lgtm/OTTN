import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { 
  Tv, 
  Film, 
  Radio, 
  History, 
  Settings as SettingsIcon, 
  Search, 
  Heart, 
  Play, 
  Pause,
  Info,
  Clock,
  Star,
  AlertCircle,
  ChevronRight,
  Maximize,
  Volume2,
  Subtitles,
  FastForward,
  Rewind,
  RotateCcw,
  Check
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
 * Advanced Samsung AVPlay Utility
 */
const AVPlayer = {
  isAvailable: !!(window.webapis && window.webapis.avplay),
  state: "IDLE",
  aspectRatio: "FIT", // FIT, FILL, STRETCH
  
  init: function() {
    if (!this.isAvailable) return;
    try {
      const keys = ["MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward"];
      keys.forEach(key => {
        try { window.tizen.tvinputdevice.registerKey(key); } catch(e) {}
      });
    } catch (e) { console.error("AVPlayer Init Error", e); }
  },

  play: function(url, onStatus, onProgress) {
    if (!this.isAvailable) return;
    try {
      this.stop();
      window.webapis.avplay.open(url);
      this.setAspectRatio(this.aspectRatio);
      
      window.webapis.avplay.setListener({
        onbufferingstart: () => onStatus("Buffering..."),
        onbufferingcomplete: () => onStatus("Playing"),
        onstreamcompleted: () => { this.state = "COMPLETED"; onStatus("Finished"); },
        onerror: (err) => onStatus("Playback Error"),
        onpreparecomplete: () => {
          window.webapis.avplay.play();
          this.state = "PLAYING";
        },
        oncurrentplaytime: (time) => {
          const duration = window.webapis.avplay.getDuration();
          onProgress(time, duration);
        }
      });

      window.webapis.avplay.prepareAsync();
    } catch (e) { onStatus("Exception: " + e.message); }
  },

  stop: function() {
    if (this.isAvailable) {
      window.webapis.avplay.stop();
      this.state = "IDLE";
    }
  },

  pause: function() {
    if (this.isAvailable && this.state === "PLAYING") {
      window.webapis.avplay.pause();
      this.state = "PAUSED";
    }
  },

  resume: function() {
    if (this.isAvailable && this.state === "PAUSED") {
      window.webapis.avplay.play();
      this.state = "PLAYING";
    }
  },

  seek: function(ms) {
    if (!this.isAvailable) return;
    try { window.webapis.avplay.jumpForward(ms); } catch(e) { console.error("Seek Error", e); }
  },

  setAspectRatio: function(mode) {
    if (!this.isAvailable) return;
    this.aspectRatio = mode;
    try {
      if (mode === "FIT") window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      else if (mode === "FILL") window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080); // In Tizen this often requires different logic but we'll use rect for now
      // Advanced: window.webapis.avplay.setStretchMode("STRETCH_FULL");
    } catch(e) {}
  },

  getAudioTracks: function() {
    if (!this.isAvailable) return [];
    try { return window.webapis.avplay.getTotalTrackInfo(); } catch(e) { return []; }
  },

  setAudioTrack: function(id) {
    if (!this.isAvailable) return;
    try { window.webapis.avplay.setSelectTrack("AUDIO", id); } catch(e) {}
  }
};

/**
 * Cache Utility
 */
const Cache = {
  get: (key) => {
    try {
      const data = localStorage.getItem(`cache_${key}`);
      return data ? JSON.parse(data) : null;
    } catch(e) { return null; }
  },
  set: (key, val) => {
    try { localStorage.setItem(`cache_${key}`, JSON.stringify(val)); } catch(e) {}
  },
  clear: () => {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith("cache_")) localStorage.removeItem(k);
    });
  }
};

function App() {
  // UI State
  const [section, setSection] = useState("Live streams");
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [isPlaying, setIsPlaying] = useState(false);
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem("favs") || "[]"));
  const [providers, setProviders] = useState([]);
  const [editingProvider, setEditingProvider] = useState(null);

  // Player State
  const [overlayVisible, setPlayerOverlay] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [audioTracks, setAudioTracks] = useState([]);
  const overlayTimer = useRef(null);

  // Focus Management
  const [navZone, setNavZone] = useState("menu");
  const [focusIndex, setFocusIndex] = useState(0);
  const lastFocusMemory = useRef({});

  useEffect(() => {
    AVPlayer.init();
    loadSection("Live streams");
    fetchProviders();
  }, []);

  const showOverlay = useCallback(() => {
    setPlayerOverlay(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => {
      if (navZone === "player") {
         // Keep visible if focused
      } else {
         setPlayerOverlay(false);
      }
    }, 5000);
  }, [navZone]);

  const fetchProviders = async () => {
    const j = await api("/api/providers");
    if (j.ok) setProviders(j.providers);
  };

  const saveProvider = async (p) => {
    setStatus("Saving...");
    try {
      const r = await fetch(BACKEND + "/api/update-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p)
      });
      const j = await r.json();
      if (j.ok) {
        setEditingProvider(null);
        await fetchProviders();
        setStatus("Provider saved");
      }
    } catch(e) { setStatus("Save failed"); }
  };

  const handleProviderInput = (field, currentVal) => {
    const val = prompt(`Enter ${field}:`, currentVal || "");
    if (val !== null) setEditingProvider(prev => ({ ...prev, [field]: val }));
  };

  const selectProvider = async (id) => {
    setStatus("Switching...");
    try {
      const r = await fetch(BACKEND + "/api/select-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const j = await r.json();
      if (j.ok) {
        Cache.clear();
        await fetchProviders();
        loadSection(section);
      }
    } catch(e) { setStatus("Switch Failed"); }
  };

  const startEditing = (p) => {
    setEditingProvider(p);
    setNavZone("items");
    setFocusIndex(0);
  };

  const restoreFocus = useCallback((zone, sec, cat) => {
    const catId = cat ? idOf(cat) : "none";
    const key = `${sec}|${zone}|${catId}`;
    const remembered = lastFocusMemory.current[key];
    setFocusIndex(remembered !== undefined ? remembered : 0);
  }, []);

  async function api(path) {
    try {
      const r = await fetch(BACKEND + path);
      return await r.json();
    } catch (e) { return { ok: false, error: e.message }; }
  }

  const loadSection = useCallback(async (sec) => {
    setSection(sec);
    setCategories([]);
    setItems([]);
    setSelectedCat(null);
    setSelectedItem(null);
    setIsPlaying(false);
    AVPlayer.stop();
    setStatus("Ready");

    if (sec === "Settings") { setNavZone("items"); setFocusIndex(0); return; }
    if (sec === "Favorites") { setItems(favorites); setNavZone("items"); setFocusIndex(0); return; }
    if (sec === "Search") { setNavZone("items"); setFocusIndex(0); return; }

    const cachedCats = Cache.get(`cats_${sec}`);
    if (cachedCats) {
      setCategories(cachedCats);
      setNavZone("categories");
      restoreFocus("categories", sec, null);
      return;
    }

    let path = "/api/live-categories";
    if (sec === "Shows archive") path = "/api/archive-categories";
    if (sec === "Media library") path = "/api/media-library";
    if (sec === "Radio stations") path = "/api/radio";

    const j = await api(path);
    if (!j.ok) return setStatus("Error: " + j.error);
    const arr = j.data || [];
    setCategories(arr);
    Cache.set(`cats_${sec}`, arr);
    setNavZone("categories");
    restoreFocus("categories", sec, null);
  }, [favorites, restoreFocus]);

  const loadItems = useCallback(async (cat) => {
    setSelectedCat(cat);
    setItems([]);
    setSelectedItem(null);
    setStatus("Loading...");

    const id = idOf(cat);
    const cacheKey = `items_${section}_${id}`;
    const cachedItems = Cache.get(cacheKey);
    if (cachedItems) {
      setItems(cachedItems);
      setNavZone("items");
      restoreFocus("items", section, cat);
      return;
    }

    let path = `/api/live-channels?genre=${encodeURIComponent(id)}`;
    if (section === "Shows archive") path = `/api/archive-list?genre=${encodeURIComponent(id)}`;
    if (section === "Media library") path = `/api/vod-list?category=${encodeURIComponent(id)}`;
    if (section === "Radio stations") path = `/api/radio-list?genre=${encodeURIComponent(id)}`;

    const j = await api(path);
    if (!j.ok) return setStatus("Error: " + j.error);
    const arr = j.data || [];
    setItems(arr);
    Cache.set(cacheKey, arr);
    setNavZone("items");
    restoreFocus("items", section, cat);
  }, [section, restoreFocus]);

  const forceReload = useCallback(() => {
    Cache.clear();
    loadSection(section);
  }, [section, loadSection]);

  const playItem = useCallback(async (item) => {
    if (!item) return;
    setSelectedItem(item);
    setStatus("Connecting...");
    const cmd = cmdOf(item);
    if (!cmd) return setStatus("Not available");

    let type = "itv";
    if (section === "Media library") type = "vod";
    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmd)}`);
    if (!j.ok || !j.url) return setStatus(j.error || "Link failed");
    
    setIsPlaying(true);
    setIsPaused(false);
    showOverlay();
    AVPlayer.play(j.url, (msg) => setStatus(msg), (time, dur) => {
      setCurrentTime(time);
      setDuration(dur);
    });
  }, [section, showOverlay]);

  const toggleFavorite = useCallback((item) => {
    const isFav = favorites.find(f => idOf(f) === idOf(item));
    let newFavs = isFav ? favorites.filter(f => idOf(f) !== idOf(item)) : [...favorites, item];
    setFavorites(newFavs);
    localStorage.setItem("favs", JSON.stringify(newFavs));
  }, [favorites]);

  // Remote Handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.keyCode || e.which;
      const keyName = e.keyName || "";
      showOverlay();

      let count = 0;
      if (navZone === "menu") count = MENU.length;
      if (navZone === "categories") count = (categories?.length || 0) + (section !== "Shows archive" ? 1 : 0);
      if (navZone === "items") {
        if (section === "Settings") count = editingProvider ? 10 : (providers?.length || 0) + 1;
        else count = items?.length || 0;
      }
      if (navZone === "player") count = 6; // Play, Rew, Fwd, Aspect, Audio, CC

      // Back / Exit
      if (key === 10009 || key === 27) {
        if (navZone === "player") { setNavZone("items"); setPlayerOverlay(false); return; }
        if (isPlaying) { setIsPlaying(false); AVPlayer.stop(); return; }
        if (navZone === "items") setNavZone(section === "Favorites" ? "menu" : "categories");
        else if (navZone === "categories") setNavZone("menu");
        return;
      }

      // Media Keys
      if (key === 415 || keyName === "MediaPlay") { AVPlayer.resume(); setIsPaused(false); }
      if (key === 19 || keyName === "MediaPause") { AVPlayer.pause(); setIsPaused(true); }

      switch (key) {
        case 38: // Up
          setFocusIndex(p => Math.max(0, p - 1));
          break;
        case 40: // Down
          setFocusIndex(p => Math.min(count - 1, p + 1));
          break;
        case 37: // Left
          if (navZone === "items") setNavZone(section === "Favorites" ? "menu" : "categories");
          else if (navZone === "categories" || navZone === "player") setNavZone("menu");
          break;
        case 39: // Right
          if (navZone === "menu") setNavZone(section === "Settings" ? "items" : "categories");
          else if (navZone === "categories") setNavZone("items");
          else if (navZone === "items" && isPlaying) setNavZone("player");
          break;
        case 13: // Enter
          if (navZone === "menu") loadSection(MENU[focusIndex].id);
          else if (navZone === "categories") {
            const hasAll = section !== "Shows archive";
            if (hasAll && focusIndex === 0) loadItems({ id: "*", title: "All" });
            else loadItems(categories[hasAll ? focusIndex - 1 : focusIndex]);
          } else if (navZone === "items") {
            if (section === "Settings") {
               if (!editingProvider) {
                 if (focusIndex === 0) forceReload();
                 else startEditing(providers[focusIndex - 1]);
               } else {
                 if (focusIndex < 7) {
                   const fields = ["name", "portal", "mac", "sn", "deviceId", "deviceId2", "signature"];
                   handleProviderInput(fields[focusIndex], editingProvider[fields[focusIndex]]);
                 } else if (focusIndex === 7) saveProvider(editingProvider);
                 else if (focusIndex === 8) saveProvider(editingProvider).then(() => selectProvider(editingProvider.id));
                 else if (focusIndex === 9) setEditingProvider(null);
               }
            } else playItem(items[focusIndex]);
          } else if (navZone === "player") {
            if (focusIndex === 0) { isPaused ? AVPlayer.resume() : AVPlayer.pause(); setIsPaused(!isPaused); }
            if (focusIndex === 1) AVPlayer.seek(-10000);
            if (focusIndex === 2) AVPlayer.seek(10000);
            if (focusIndex === 3) AVPlayer.setAspectRatio(AVPlayer.aspectRatio === "FIT" ? "FILL" : "FIT");
          }
          break;
        case 33: // PageUp (Fav)
          if (navZone === "items" && items[focusIndex]) toggleFavorite(items[focusIndex]);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navZone, focusIndex, categories, items, section, isPlaying, isPaused, favorites, editingProvider, providers, showOverlay, loadSection, loadItems, playItem, toggleFavorite]);

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h > 0 ? h + ':' : ''}${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className={`app-shell ${isPlaying ? "video-playing" : ""}`}>
      {/* Sidebar */}
      <nav className={`sidebar ${navZone === "menu" ? "active-zone" : ""}`}>
        <div className="brand">
          <div className="brand-logo"><Tv color="white" /></div>
          <span>POOMANI TV</span>
        </div>
        <div className="nav-links">
          {MENU.map((m, i) => (
            <div key={m.id} className={`nav-item ${section === m.id ? "current" : ""} ${navZone === "menu" && focusIndex === i ? "focused" : ""}`}>
              <m.icon size={28} />
              <span>{m.label}</span>
            </div>
          ))}
        </div>
        <div className="clock">
          <Clock size={20} />
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </nav>

      {/* Categories Panel */}
      {categories?.length > 0 && (
        <section className={`cat-panel ${navZone === "categories" ? "active-zone" : ""}`}>
          <div className="panel-header"><h3>Categories</h3></div>
          <div className="scroll-list">
            {section !== "Shows archive" && (
              <div className={`list-row ${selectedCat?.id === "*" ? "active" : ""} ${navZone === "categories" && focusIndex === 0 ? "focused" : ""}`}>
                All Content
              </div>
            )}
            {categories.map((c, i) => (
              <div key={i} className={`list-row ${selectedCat === c ? "active" : ""} ${navZone === "categories" && focusIndex === (section !== "Shows archive" ? i + 1 : i) ? "focused" : ""}`}>
                {titleOf(c)}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Content */}
      <main className={`content-area ${navZone === "items" ? "active-zone" : ""}`}>
        <header className="main-header">
          <div className="header-info">
            <h1>{section === "Favorites" ? "My List" : (selectedCat ? titleOf(selectedCat) : section)}</h1>
            <div className={`status-badge ${(status && status.includes("Error")) ? "error" : ""}`}>
              {(status && status.includes("Error")) ? <AlertCircle size={14}/> : <Info size={14}/>}
              {status || "Ready"}
            </div>
          </div>
        </header>

        {/* Premium Player Container */}
        <div className="player-wrapper">
          {overlayVisible && isPlaying && (
            <div className={`player-overlay visible ${navZone === "player" ? "active-zone" : ""}`}>
              <div className="player-top">
                <div className="player-title">
                  <h2>{titleOf(selectedItem)}</h2>
                  <span className="status-badge">{status}</span>
                </div>
                <div className="player-meta">
                   <Clock size={20} /> {new Date().toLocaleTimeString()}
                </div>
              </div>

              <div className="player-bottom">
                <div className="time-info">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="seek-bar-container">
                  <div className="seek-bar-fill" style={{width: `${(currentTime / duration) * 100}%`}}></div>
                </div>
                
                <div className="player-actions">
                  <div className={`action-btn ${navZone === 'player' && focusIndex === 1 ? 'focused' : ''}`}><Rewind size={32}/><span className="action-label">-10s</span></div>
                  <div className={`action-btn ${navZone === 'player' && focusIndex === 0 ? 'focused' : ''}`}>{isPaused ? <Play size={48}/> : <Pause size={48}/>}<span className="action-label">{isPaused ? "Play" : "Pause"}</span></div>
                  <div className={`action-btn ${navZone === 'player' && focusIndex === 2 ? 'focused' : ''}`}><FastForward size={32}/><span className="action-label">+10s</span></div>
                  <div className={`action-btn ${navZone === 'player' && focusIndex === 3 ? 'focused' : ''}`}><Maximize size={32}/><span className="action-label">{AVPlayer.aspectRatio}</span></div>
                  <div className={`action-btn ${navZone === 'player' && focusIndex === 4 ? 'focused' : ''}`}><Volume2 size={32}/><span className="action-label">Audio</span></div>
                  <div className={`action-btn ${navZone === 'player' && focusIndex === 5 ? 'focused' : ''}`}><Subtitles size={32}/><span className="action-label">CC</span></div>
                </div>
              </div>
            </div>
          )}
          {!isPlaying && (
            <div className="player-empty">
              <Play size={80} color="white" />
              <span>Select content for premium playback</span>
            </div>
          )}
        </div>

        {/* Items Grid/List */}
        <div className={`items-container ${section === "Live streams" || section === "Radio stations" ? "list-mode" : "grid-mode"}`}>
          {/* Settings logic matches previous multi-provider edit system */}
          {section === "Settings" && !editingProvider && (
             <div className="settings-panel" style={{width: '100%'}}>
                <div className={`item-card list-mode ${navZone === "items" && focusIndex === 0 ? "focused" : ""}`} onClick={forceReload}>
                  <span className="row-title">Refresh Data</span><ChevronRight />
                </div>
                {(providers || []).map((p, i) => (
                  <div key={p.id} className={`item-card list-mode ${p.active ? "active" : ""} ${navZone === "items" && focusIndex === (i + 1) ? "focused" : ""}`} onClick={() => startEditing(p)}>
                    <span className="row-title">{p.name}</span>{p.active && <Check color="green" />}
                  </div>
                ))}
             </div>
          )}
          
          {(items || []).map((it, i) => {
            const isFav = favorites.some(f => idOf(f) === idOf(it));
            return (
              <div key={i} className={`item-card ${selectedItem === it ? "active" : ""} ${navZone === "items" && focusIndex === i ? "focused" : ""}`}>
                {section !== "Live streams" ? (
                  <div className="card-inner">
                    <img src={thumbOf(it) || "https://placehold.co/400x225/000/fff?text=No+Preview"} alt="" />
                    <div className="card-content">
                      <span className="card-title">{titleOf(it)}</span>
                      {isFav && <Heart size={16} fill="red" color="red" />}
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="row-num">{it.number || i+1}</span>
                    <span className="row-title">{titleOf(it)}</span>
                    <div className="row-right">
                      {it.epg_progname && <span className="row-epg">{it.epg_progname}</span>}
                      {isFav && <Heart size={18} fill="red" color="red" />}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);