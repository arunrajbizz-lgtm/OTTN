import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { 
  Tv, 
  Film, 
  Radio, 
  History, 
  Settings, 
  Search, 
  Heart, 
  Play, 
  Info,
  Clock,
  Star,
  AlertCircle
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
  { id: "Settings", icon: Settings, label: "Settings" }
];

const titleOf = (x) => x?.title || x?.name || x?.o_name || x?.fname || x?.tv_genre_name || x?.category_name || x?.genre_title || "No name";
const idOf = (x) => x?.id || x?.category_id || x?.genre_id || x?.tv_genre_id || x?.alias || "*";
const cmdOf = (x) => x?.cmd || x?.cmd_1 || x?.url || x?.stream_url || x?.file || x?.cmds?.[0]?.url || "";
const thumbOf = (it) => it?.screenshot || it?.logo || it?.tv_genre_logo || "";

/**
 * Samsung AVPlay Utility
 */
const AVPlayer = {
  isAvailable: !!(window.webapis && window.webapis.avplay),
  
  init: function() {
    if (!this.isAvailable) return;
    try {
      // Official key registration
      const keys = ["MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward"];
      keys.forEach(key => {
        try {
          window.tizen.tvinputdevice.registerKey(key);
        } catch(e) {}
      });
    } catch (e) {
      console.error("AVPlayer Init Error", e);
    }
  },

  play: function(url, onStatus) {
    if (!this.isAvailable) {
      console.warn("AVPlay not available, falling back to log");
      return;
    }

    try {
      window.webapis.avplay.stop();
      window.webapis.avplay.open(url);
      
      // Full screen by default or use specific rect
      window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      
      // Advanced Listener
      window.webapis.avplay.setListener({
        onbufferingstart: () => onStatus("Buffering..."),
        onbufferingcomplete: () => onStatus("Playing"),
        onstreamcompleted: () => onStatus("Finished"),
        onerror: (err) => onStatus("AVPlay Error: " + err),
        onpreparecomplete: () => {
          window.webapis.avplay.play();
        }
      });

      // Optimized for Stalker Streams
      window.webapis.avplay.prepareAsync();
    } catch (e) {
      onStatus("AVPlay Exception: " + e.message);
    }
  },

  stop: function() {
    if (this.isAvailable) window.webapis.avplay.stop();
  },

  pause: function() {
    if (this.isAvailable) window.webapis.avplay.pause();
  },

  resume: function() {
    if (this.isAvailable) window.webapis.avplay.play();
  }
};

/**
 * Persistent Cache Utility
 */
const Cache = {
  get: (key) => {
    try {
      const data = localStorage.getItem(`cache_${key}`);
      return data ? JSON.parse(data) : null;
    } catch(e) { return null; }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(`cache_${key}`, JSON.stringify(val));
    } catch(e) {}
  },
  clear: () => {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith("cache_")) localStorage.removeItem(k);
    });
  }
};

function App() {
  const [section, setSection] = useState("Live streams");
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [isPlaying, setIsPlaying] = useState(false);
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem("favs") || "[]"));
  
  // TMDB Data
  const [tmdbData, setTmdbData] = useState(null);
  const [providers, setProviders] = useState([]);

  // Focus Management
  const [navZone, setNavZone] = useState("menu");
  const [focusIndex, setFocusIndex] = useState(0);
  const lastFocusMemory = useRef({});

  useEffect(() => {
    AVPlayer.init();
    loadSection("Live streams");
    fetchProviders();
  }, []);

  const [editingProvider, setEditingProvider] = useState(null);

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
    if (val !== null) {
      setEditingProvider(prev => ({ ...prev, [field]: val }));
    }
  };

  const selectProvider = async (id) => {
    setStatus("Switching provider...");
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
      } else {
        setStatus("Switch Error: " + j.error);
      }
    } catch(e) { setStatus("Switch Failed"); }
  };

  const startEditing = (p) => {
    setEditingProvider(p);
    setNavZone("items");
    setFocusIndex(0);
  };

  const getFocusKey = useCallback(() => {
    const catId = selectedCat ? idOf(selectedCat) : "none";
    return `${section}|${navZone}|${catId}`;
  }, [section, navZone, selectedCat]);

  const rememberFocus = useCallback(() => {
    const key = getFocusKey();
    lastFocusMemory.current[key] = focusIndex;
  }, [getFocusKey, focusIndex]);

  const restoreFocus = useCallback((zone, sec, cat) => {
    const catId = cat ? idOf(cat) : "none";
    const key = `${sec}|${zone}|${catId}`;
    const remembered = lastFocusMemory.current[key];
    setFocusIndex(remembered !== undefined ? remembered : 0);
  }, []);

  async function api(path) {
    try {
      const r = await fetch(BACKEND + path);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  const loadSection = useCallback(async (sec) => {
    rememberFocus();
    setSection(sec);
    setCategories([]);
    setItems([]);
    setSelectedCat(null);
    setSelectedItem(null);
    setIsPlaying(false);
    AVPlayer.stop();
    setStatus("Ready");
    setTmdbData(null);

    if (sec === "Settings") {
      setNavZone("items");
      setFocusIndex(0);
      setStatus("Settings Menu");
      return;
    }

    if (sec === "Favorites") {
      setItems(favorites);
      setNavZone("items");
      setFocusIndex(0);
      setStatus(`My List (${favorites.length})`);
      return;
    }

    if (sec === "Search") {
      setNavZone("items");
      setFocusIndex(0);
      setStatus("Search Content");
      return;
    }

    // Check Cache
    const cachedCats = Cache.get(`cats_${sec}`);
    if (cachedCats) {
      setCategories(cachedCats);
      setStatus(`${sec} (Cached)`);
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
    Cache.set(`cats_${sec}`, arr); // Store in cache
    setStatus(`${sec} - ${arr.length} categories`);
    
    setNavZone("categories");
    restoreFocus("categories", sec, null);
  }, [favorites, rememberFocus, restoreFocus]);

  const loadItems = useCallback(async (cat) => {
    rememberFocus();
    setSelectedCat(cat);
    setItems([]);
    setSelectedItem(null);
    setStatus("Fetching content...");

    const id = idOf(cat);
    const cacheKey = `items_${section}_${id}`;

    // Check Cache
    const cachedItems = Cache.get(cacheKey);
    if (cachedItems) {
      setItems(cachedItems);
      setStatus(`${titleOf(cat)} (Cached)`);
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
    Cache.set(cacheKey, arr); // Store in cache
    setStatus(`${titleOf(cat)} - ${arr.length} items`);
    
    setNavZone("items");
    restoreFocus("items", section, cat);
  }, [section, rememberFocus, restoreFocus]);

  const forceReload = useCallback(() => {
    setStatus("Refreshing data...");
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
    if (section === "Radio stations") type = "radio";

    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmd)}`);
    if (!j.ok || !j.url) return setStatus(j.error || "Link failed");
    
    setIsPlaying(true);
    AVPlayer.play(j.url, (msg) => setStatus(msg));

    if (section === "Media library") {
      const info = await api(`/api/tmdb/search?title=${encodeURIComponent(titleOf(item))}`);
      if (info.ok) setTmdbData(info);
    }
  }, [section]);

  const toggleFavorite = useCallback((item) => {
    const isFav = favorites.find(f => idOf(f) === idOf(item));
    let newFavs = isFav ? favorites.filter(f => idOf(f) !== idOf(item)) : [...favorites, item];
    setFavorites(newFavs);
    localStorage.setItem("favs", JSON.stringify(newFavs));
  }, [favorites]);

  // Remote Support Logic
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.keyCode || e.which;
      const keyName = e.keyName || "";

      // Navigation counts
      let count = 0;
      if (navZone === "menu") count = MENU.length;
      if (navZone === "categories") count = categories.length + (section !== "Shows archive" ? 1 : 0);
      if (navZone === "items") {
        if (section === "Settings") count = providers.length + 1; // Providers + Refresh button
        else count = items.length;
      }

      // Official Remote Key Handling
      if (key === 10009 || key === 27) { // Back
        if (isPlaying) {
          setIsPlaying(false);
          AVPlayer.stop();
          return;
        }
        if (navZone === "items") {
          setNavZone(section === "Favorites" ? "menu" : "categories");
          restoreFocus(navZone, section, selectedCat);
        } else if (navZone === "categories") {
          setNavZone("menu");
        }
        return;
      }

      // Media Keys
      if (key === 415 || keyName === "MediaPlay") AVPlayer.resume();
      if (key === 19 || keyName === "MediaPause") AVPlayer.pause();
      if (key === 413 || keyName === "MediaStop") {
        AVPlayer.stop();
        setIsPlaying(false);
      }

      switch (key) {
        case 38: // Up
          setFocusIndex(p => Math.max(0, p - 1));
          break;
        case 40: // Down
          setFocusIndex(p => Math.min(count - 1, p + 1));
          break;
        case 37: // Left
          if (navZone !== "menu") {
            setNavZone(navZone === "items" && section !== "Favorites" ? "categories" : "menu");
          }
          break;
        case 39: // Right
          if (navZone === "menu" && categories.length > 0) setNavZone("categories");
          else if (navZone === "categories" && items.length > 0) setNavZone("items");
          break;
        case 13: // Enter
          if (navZone === "menu") loadSection(MENU[focusIndex].id);
          else if (navZone === "categories") {
            const hasAll = section !== "Shows archive";
            if (hasAll && focusIndex === 0) loadItems({ id: "*", title: "All" });
            else {
              const cat = categories[hasAll ? focusIndex - 1 : focusIndex];
              if (section === "Shows archive") playItem(cat);
              else loadItems(cat);
            }
          } else if (navZone === "items") {
            if (section === "Settings") {
              if (focusIndex === 0) forceReload();
              else {
                const pr = providers[focusIndex - 1];
                if (pr) selectProvider(pr.id);
              }
            } else {
              playItem(items[focusIndex]);
            }
          }
          break;
        case 33: // PageUp (Fav)
          if (navZone === "items" && items[focusIndex]) toggleFavorite(items[focusIndex]);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navZone, focusIndex, categories, items, section, selectedCat, favorites, loadSection, loadItems, playItem, isPlaying, toggleFavorite]);

  return (
    <div className={`app-shell ${isPlaying ? "video-playing" : ""}`}>
      {/* Sidebar */}
      <nav className={`sidebar ${navZone === "menu" ? "active-zone" : ""}`}>
        <div className="brand">
          <div className="brand-logo"><Tv /></div>
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

      {/* Categories */}
      {categories.length > 0 && (
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
            <div className={`status-badge ${status.includes("Error") ? "error" : ""}`}>
              {status.includes("Error") ? <AlertCircle size={14}/> : <Info size={14}/>}
              {status}
            </div>
          </div>
        </header>

        {/* Video Area */}
        <div className="player-wrapper">
          {!isPlaying && (
            <div className="player-empty">
              <Play size={64} className="play-icon" />
              <span>Select content to start native playback</span>
            </div>
          )}
          
          {selectedItem && (
            <div className={`overlay-info ${isPlaying ? "visible" : ""}`}>
              <div className="meta">
                <span className="channel-num">#{selectedItem.number || "00"}</span>
                <h2>{titleOf(selectedItem)}</h2>
              </div>
              {tmdbData && (
                <div className="tmdb-mini">
                  <div className="rating"><Star size={16} fill="gold" color="gold"/> {tmdbData.rating}</div>
                  <p>{tmdbData.overview?.substring(0, 150)}...</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Items */}
        <div className={`items-container ${section === "Live streams" || section === "Radio stations" ? "list-mode" : "grid-mode"}`}>
          {section === "Settings" && !editingProvider && (
             <div className="settings-panel" style={{width: '100%'}}>
               <div 
                 className={`item-card list-mode ${navZone === "items" && focusIndex === 0 ? "focused" : ""}`}
                 onClick={forceReload}
               >
                 <span className="row-title">Refresh Data (Clear Cache)</span>
                 <div className="row-right"><ChevronRight size={24} /></div>
               </div>

               <h3 style={{margin: '40px 0 20px', color: '#666', textTransform: 'uppercase', fontSize: '18px'}}>Portal Configuration</h3>
               {providers.map((p, i) => (
                 <div 
                   key={p.id}
                   className={`item-card list-mode ${p.active ? "active" : ""} ${navZone === "items" && focusIndex === (i + 1) ? "focused" : ""}`}
                   onClick={() => startEditing(p)}
                 >
                   <span className="row-title">{p.name || `Provider ${i+1}`}</span>
                   <div className="row-right">
                     {p.active && <div className="status-badge" style={{background: '#1688f0', color: 'white', marginRight: '10px'}}>ACTIVE</div>}
                     <span style={{fontSize: '14px', opacity: 0.5}}>Edit Details</span>
                     <ChevronRight size={24} />
                   </div>
                 </div>
               ))}

               <div className="status-badge info" style={{marginTop: '40px'}}>
                 Version 1.4.0 - Advanced Configuration Enabled
               </div>
             </div>
          )}

          {section === "Settings" && editingProvider && (
            <div className="settings-panel" style={{width: '100%'}}>
               <h3 style={{marginBottom: '20px'}}>Editing: {editingProvider.name}</h3>
               
               <div className="input-group" style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                  {[
                    { label: "Name", key: "name" },
                    { label: "Portal URL", key: "portal" },
                    { label: "MAC Address", key: "mac" },
                    { label: "Serial Number (SN)", key: "sn" },
                    { label: "Device ID 1", key: "deviceId" },
                    { label: "Device ID 2", key: "deviceId2" },
                    { label: "Signature", key: "signature" }
                  ].map((field, i) => (
                    <div 
                      key={field.key}
                      className={`item-card list-mode ${navZone === "items" && focusIndex === i ? "focused" : ""}`}
                      onClick={() => handleProviderInput(field.key, editingProvider[field.key])}
                    >
                      <span style={{width: '180px', fontSize: '16px', color: '#888'}}>{field.label}:</span>
                      <span className="row-title" style={{fontSize: '18px'}}>{editingProvider[field.key] || "(Empty)"}</span>
                    </div>
                  ))}

                  <div style={{display: 'flex', gap: '20px', marginTop: '30px'}}>
                    <div 
                      className={`item-card list-mode ${navZone === "items" && focusIndex === 7 ? "focused" : ""}`}
                      style={{flex: 1, background: '#1688f0'}}
                      onClick={() => saveProvider(editingProvider)}
                    >
                      <span className="row-title" style={{textAlign: 'center', color: 'white'}}>SAVE CONFIG</span>
                    </div>
                    <div 
                      className={`item-card list-mode ${navZone === "items" && focusIndex === 8 ? "focused" : ""}`}
                      style={{flex: 1, background: '#2ecc71'}}
                      onClick={() => {
                        saveProvider(editingProvider).then(() => selectProvider(editingProvider.id));
                      }}
                    >
                      <span className="row-title" style={{textAlign: 'center', color: 'white'}}>ACTIVATE NOW</span>
                    </div>
                    <div 
                      className={`item-card list-mode ${navZone === "items" && focusIndex === 9 ? "focused" : ""}`}
                      style={{flex: 1, background: '#e74c3c'}}
                      onClick={() => setEditingProvider(null)}
                    >
                      <span className="row-title" style={{textAlign: 'center', color: 'white'}}>CANCEL</span>
                    </div>
                  </div>
               </div>
            </div>
          )}
          
          {items.map((it, i) => {
            const isFav = favorites.some(f => idOf(f) === idOf(it));
            return (
              <div key={i} className={`item-card ${selectedItem === it ? "active" : ""} ${navZone === "items" && focusIndex === i ? "focused" : ""}`}>
                {section !== "Live streams" && section !== "Radio stations" ? (
                  <div className="card-inner">
                    <img src={thumbOf(it) || "https://placehold.co/300x170/1a1a1a/ffffff?text=No+Preview"} alt="" />
                    <div className="card-content">
                      <span className="card-title">{titleOf(it)}</span>
                      {isFav && <Heart size={14} fill="red" color="red" />}
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="row-num">{it.number || i+1}</span>
                    <span className="row-title">{titleOf(it)}</span>
                    <div className="row-right">
                      {it.epg_progname && <span className="row-epg">{it.epg_progname}</span>}
                      {isFav && <Heart size={16} fill="red" color="red" />}
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