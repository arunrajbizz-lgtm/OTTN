import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { 
  Tv, Film, Radio, History, Settings as SettingsIcon, Search, Heart, 
  Play, Pause, Info, Clock, AlertCircle, ChevronRight, 
  Maximize, Volume2, Subtitles, FastForward, Rewind, Check, List, Layers
} from "lucide-react";
import "./style.css";

const BACKEND = ""; // Relative for production, or absolute for local dev

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
const thumbOf = (it) => it?.screenshot || it?.logo || it?.tv_genre_logo || it?.poster || "";

const AVPlayer = {
  isAvailable: !!(window.webapis && window.webapis.avplay),
  state: "IDLE",
  ratio: "FIT",
  init: function() {
    if (!this.isAvailable) return;
    const keys = [
      "MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward",
      "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
      "ChannelUp", "ChannelDown", "VolumeUp", "VolumeDown", "VolumeMute",
      "Info", "Guide", "Search", "Menu", "Source", "ColorRed", "ColorGreen", "ColorYellow", "ColorBlue"
    ];
    keys.forEach(k => {
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

/**
 * Universal Series Parser
 * Scans Stalker response recursively to find seasons and episodes
 */
function parseSeriesInfo(response) {
  console.log("SERIES INFO RAW", response);
  const js = response?.data?.js || response?.data || response;
  
  const seriesInfo = {
    id: js.id,
    title: titleOf(js),
    poster: thumbOf(js),
    backdrop: js.backdrop || "",
    plot: js.description || js.plot || js.info || "",
    seasons: []
  };

  const episodesMap = {};

  // Helper to discover episodes recursively
  const discover = (obj) => {
    if (!obj || typeof obj !== 'object') return;

    // If it has a cmd and looks like an episode
    if (obj.cmd && (obj.name || obj.title)) {
      const sNum = parseInt(obj.season_number || obj.season || 1);
      const eNum = parseInt(obj.episode_number || obj.episode || obj.number || 0);
      
      if (!episodesMap[sNum]) episodesMap[sNum] = [];
      episodesMap[sNum].push({
        id: obj.id || `${sNum}_${eNum}`,
        title: titleOf(obj),
        episodeNumber: eNum,
        cmd: obj.cmd
      });
      return;
    }

    // Recurse into arrays or objects
    for (let key in obj) {
      if (Array.isArray(obj[key])) {
        obj[key].forEach(discover);
      } else if (typeof obj[key] === 'object') {
        discover(obj[key]);
      }
    }
  };

  discover(js);

  // Convert map to sorted seasons array
  Object.keys(episodesMap).sort((a,b) => a-b).forEach(sNum => {
    seriesInfo.seasons.push({
      seasonNumber: parseInt(sNum),
      episodes: episodesMap[sNum].sort((a,b) => a.episodeNumber - b.episodeNumber)
    });
  });

  console.log("PARSED SEASONS", seriesInfo.seasons);
  return seriesInfo;
}

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

  // Series Specific State
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);

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
    setSeriesInfo(null);
    AVPlayer.stop();
    setFocusIndex(0);
    
    if (sec === "Settings") { 
      setNavZone("items"); 
      setFocusIndex(0); 
      api("/api/providers").then(j => { if(j.ok) setProviders(j.providers || []); });
      return; 
    }
    if (sec === "Favorites") { setItems(favorites); setNavZone("items"); return; }
    if (sec === "Search") { 
      setNavZone("items"); 
      const query = prompt("Search for content...");
      if (query) {
        setStatus(`Searching for "${query}"...`);
        api(`/api/search?q=${encodeURIComponent(query)}`).then(j => {
          if (j.ok) {
            setItems(j.data || []);
            setStatus(j.data?.length ? `Found ${j.data.length} results` : "No results found");
          } else { setStatus("Search failed"); }
        });
      }
      return; 
    }

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
    } else { setStatus("Portal Error"); }
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

  const loadSeriesDetail = useCallback(async (item) => {
    setStatus("Loading Series Info...");
    const j = await api(`/api/series-info?id=${item.id}`);
    if (j.ok) {
      const parsed = parseSeriesInfo(j.data);
      setSeriesInfo(parsed);
      setNavZone("seasons");
      setFocusIndex(0);
      setActiveSeasonIdx(0);
      setStatus("Series Ready");
    } else {
      setStatus("Error loading series");
    }
  }, [api]);

  const toggleFavorite = useCallback((item) => {
    if (!item) return;
    setFavorites(prev => {
      const isFav = prev.some(f => idOf(f) === idOf(item));
      const next = isFav ? prev.filter(f => idOf(f) !== idOf(item)) : [...prev, item];
      localStorage.setItem("favs", JSON.stringify(next));
      return next;
    });
  }, []);

  const playItem = useCallback(async (item, typeOverride = null) => {
    if (!item) return;
    setSelectedItem(item);
    setStatus("Connecting...");
    let type = typeOverride || ((section === "Media library" || seriesInfo) ? "vod" : "itv");
    const cmd = cmdOf(item);
    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmd)}`);
    if (j.ok && j.url) {
      setIsPlaying(true);
      setIsPaused(false);
      setOverlay(true);
      AVPlayer.play(j.url, setStatus, (c, d) => setProgress({ current: c, duration: d }));
    } else {
      setStatus("Stream Error");
    }
  }, [section, api, seriesInfo]);

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

      // Handle Return / Back
      if (key === 10009 || key === 27) {
        if (editingProvider) { setEditingProvider(null); setFocusIndex(0); return; }
        if (overlay && navZone === "player") { setNavZone("items"); setOverlay(false); return; }
        if (isPlaying) { AVPlayer.stop(); setIsPlaying(false); return; }
        if (seriesInfo) {
          if (navZone === "episodes") { setNavZone("seasons"); setFocusIndex(activeSeasonIdx); return; }
          setSeriesInfo(null); setNavZone("items"); setFocusIndex(items.findIndex(it => it.id === seriesInfo.id)); return;
        }
        if (navZone === "items") { 
          if (["Settings", "Favorites", "Search"].includes(section)) {
            setNavZone("menu"); setFocusIndex(MENU.findIndex(m => m.id === section));
          } else { setNavZone("categories"); setFocusIndex(0); }
          return;
        }
        if (navZone === "categories") { setNavZone("menu"); setFocusIndex(MENU.findIndex(m => m.id === section)); return; }
        return;
      }

      // Media Controls
      switch(key) {
        case 415: case 19: case 10252: // Play/Pause
          if (isPlaying) { isPaused ? AVPlayer.resume() : AVPlayer.pause(); setIsPaused(!isPaused); }
          break;
        case 413: // Stop
          if (isPlaying) { AVPlayer.stop(); setIsPlaying(false); }
          break;
        case 412: if (isPlaying) AVPlayer.seek(-30000); break; // Rewind
        case 417: if (isPlaying) AVPlayer.seek(30000); break;  // FF
        case 427: // ChannelUp
          if (navZone === "items" && section === "Live streams") {
            const next = (focusIndex + 1) % items.length;
            setFocusIndex(next); playItem(items[next]);
          }
          break;
        case 428: // ChannelDown
          if (navZone === "items" && section === "Live streams") {
            const prev = (focusIndex - 1 + items.length) % items.length;
            setFocusIndex(prev); playItem(items[prev]);
          }
          break;
        case 31: setOverlay(true); break; // Info
        case 458: loadSection("Live streams"); break; // Guide
        case 10182: loadSection("Search"); break; // Search
        case 403: if (navZone === "items" && items[focusIndex]) toggleFavorite(items[focusIndex]); break; // Red
        case 406: if (isPlaying) AVPlayer.setRatio(AVPlayer.ratio === "FIT" ? "FILL" : "FIT"); break; // Blue
      }

      let max = navZone === "menu" ? MENU.length : 
                navZone === "categories" ? (categories?.length || 0) + (section !== "Shows archive" ? 1 : 0) :
                navZone === "items" ? (section === "Settings" ? (editingProvider ? 10 : (providers?.length || 0) + 1) : (items?.length || 0)) :
                navZone === "player" ? 6 :
                navZone === "seasons" ? seriesInfo?.seasons?.length || 0 :
                navZone === "episodes" ? seriesInfo?.seasons[activeSeasonIdx]?.episodes?.length || 0 : 0;

      switch(key) {
        case 38: setFocusIndex(p => Math.max(0, p - 1)); break; // Up
        case 40: setFocusIndex(p => Math.min(max - 1, p + 1)); break; // Down
        case 37: // Left
          if (navZone === "episodes") { setNavZone("seasons"); setFocusIndex(activeSeasonIdx); }
          else if (navZone === "seasons") { setSeriesInfo(null); setNavZone("items"); }
          else if (navZone === "items") { 
            if (["Settings", "Favorites", "Search"].includes(section)) { setNavZone("menu"); setFocusIndex(MENU.findIndex(m => m.id === section)); }
            else { setNavZone("categories"); setFocusIndex(0); }
          }
          else if (navZone === "categories" || navZone === "player") { setNavZone("menu"); setFocusIndex(MENU.findIndex(m => m.id === section)); }
          break;
        case 39: // Right
          if (navZone === "menu") { 
            if (["Settings", "Favorites", "Search"].includes(section)) { setNavZone("items"); setFocusIndex(0); }
            else if (categories?.length > 0) { setNavZone("categories"); setFocusIndex(0); }
          }
          else if (navZone === "categories" && items?.length > 0) { setNavZone("items"); setFocusIndex(0); }
          else if (navZone === "items" && isPlaying) { setNavZone("player"); setFocusIndex(0); }
          else if (navZone === "seasons") { setNavZone("episodes"); setFocusIndex(0); }
          break;
        case 13: // Enter
          if (navZone === "menu") loadSection(MENU[focusIndex].id);
          else if (navZone === "categories") {
            const hasAll = section !== "Shows archive";
            if (hasAll && focusIndex === 0) loadItems({ id: "*", title: "All Content" });
            else loadItems(categories[hasAll ? focusIndex - 1 : focusIndex]);
          } else if (navZone === "items") {
            const it = items[focusIndex];
            if (section === "Settings") {
                // Settings logic...
            } else if (it.is_series == 1 || it.series == 1) {
              loadSeriesDetail(it);
            } else playItem(it);
          } else if (navZone === "seasons") {
            setActiveSeasonIdx(focusIndex);
            setNavZone("episodes");
            setFocusIndex(0);
          } else if (navZone === "episodes") {
            playItem(seriesInfo.seasons[activeSeasonIdx].episodes[focusIndex], "vod");
          } else if (navZone === "player") {
             // Player actions...
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navZone, focusIndex, categories, items, section, isPlaying, overlay, editingProvider, providers, isPaused, showOverlay, loadSection, loadItems, playItem, seriesInfo, activeSeasonIdx, loadSeriesDetail, toggleFavorite, api]);

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

      {categories?.length > 0 && !seriesInfo && (
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

      {seriesInfo && (
         <section className={`cat-panel active-zone`}>
            <div className="panel-header"><h3>Seasons</h3></div>
            <div className="scroll-list">
               {seriesInfo.seasons.map((s, i) => (
                 <div key={i} className={`list-row ${activeSeasonIdx === i ? "active" : ""} ${navZone === "seasons" && focusIndex === i ? "focused" : ""}`}>
                    Season {s.seasonNumber}
                 </div>
               ))}
            </div>
         </section>
      )}

      <main className={`content-area ${ (navZone === "items" || navZone === "episodes") ? "active-zone" : ""}`}>
        <header className="main-header">
           <h1>{seriesInfo ? seriesInfo.title : (selectedCat ? titleOf(selectedCat) : section)}</h1>
           <div className="status-badge"><Info size={14}/> {status}</div>
        </header>

        <div className="player-wrapper">
          {overlay && isPlaying && (
            <div className={`player-overlay visible ${navZone === "player" ? "active-zone" : ""}`}>
               {/* Player Overlay Content */}
               <div className="stb-info-tile">
                  <h2 className="stb-title">{titleOf(selectedItem)}</h2>
                  <div className="stb-progress-bar"><div className="stb-progress-fill" style={{width: `${(progress.current / progress.duration) * 100}%`}}></div></div>
                  <div style={{display:'flex', justifyContent:'space-between', marginTop: '10px'}}><span>{formatT(progress.current)}</span><span>{formatT(progress.duration)}</span></div>
               </div>
            </div>
          )}
          {!isPlaying && !seriesInfo && <div className="player-empty"><Play size={80} color="white" /><span>Select Content to Play</span></div>}
          {seriesInfo && !isPlaying && (
            <div className="series-poster-hero" style={{backgroundImage: `url(${seriesInfo.backdrop || seriesInfo.poster})`, backgroundSize:'cover', height:'100%', borderRadius:'30px', position:'relative'}}>
               <div style={{position:'absolute', inset:0, background:'linear-gradient(to right, rgba(0,0,0,0.9), transparent)', padding:'60px', display:'flex', flexDirection:'column', justifyContent:'center'}}>
                  <p style={{fontSize:'24px', maxWidth:'600px', opacity:0.8}}>{seriesInfo.plot}</p>
               </div>
            </div>
          )}
        </div>

        <div className={`items-container ${ (section === "Live streams" || seriesInfo) ? "list-mode" : "grid-mode"}`}>
          {seriesInfo ? (
            seriesInfo.seasons[activeSeasonIdx]?.episodes.map((ep, i) => (
              <div key={i} className={`item-card list-mode ${navZone === "episodes" && focusIndex === i ? "focused" : ""}`} style={{padding:'25px', display:'flex', gap:'20px', alignItems:'center'}}>
                 <span style={{color:'red', fontWeight:900, fontSize:'24px'}}>{ep.episodeNumber}</span>
                 <b style={{fontSize:'22px'}}>{ep.title}</b>
              </div>
            ))
          ) : (
            (items || []).map((it, i) => (
              <div key={i} className={`item-card ${selectedItem === it ? "active" : ""} ${navZone === "items" && focusIndex === i ? "focused" : ""}`} onClick={() => playItem(it)}>
                 {it.is_series == 1 || it.series == 1 ? (
                   <div className="card-inner">
                      <img src={thumbOf(it) || "https://placehold.co/400x225/111/eee?text=Series"} alt="" />
                      <div className="card-content" style={{display:'flex', justifyContent:'space-between'}}>
                         <span>{titleOf(it)}</span>
                         <Layers size={18} color="red" />
                      </div>
                   </div>
                 ) : section !== "Live streams" ? (
                   <div className="card-inner"><img src={thumbOf(it) || "https://placehold.co/400x225/111/eee?text=No+Poster"} alt="" /><div className="card-content">{titleOf(it)}</div></div>
                 ) : (
                   <div style={{padding:'25px', display:'flex', gap:'30px', alignItems:'center'}}><span style={{color:'red', fontSize:'24px', fontWeight: 900, minWidth: '60px'}}>{it.number || i+1}</span><b style={{fontSize:'24px', flex: 1}}>{titleOf(it) || "No name"}</b><span style={{opacity:0.6, fontStyle:'italic', fontSize:'20px'}}>{it.epg_progname}</span></div>
                 )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);