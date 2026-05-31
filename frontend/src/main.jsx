import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { 
  Tv, Film, Radio, History, Settings as SettingsIcon, Search, Heart, 
  Play, Pause, Info, Clock, AlertCircle, ChevronRight, 
  Maximize, Volume2, Subtitles, FastForward, Rewind, Check, List, Layers, 
  Calendar, Star, Clapperboard, RotateCcw, RotateCw, PlayCircle
} from "lucide-react";
import "./style.css";

const BACKEND = ""; // Relative for production

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
  const [editingProvider, setEditingProvider] = useState(null);
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

  // Focus Memory
  const zoneIndices = useRef({ menu: 0, categories: 0, items: 0, seasons: 0, episodes: 0, player: 0 });

  const updateFocus = useCallback((zone, idx) => {
    zoneIndices.current[zone] = idx;
    if (navZone === zone) setFocusIndex(idx);
  }, [navZone]);

  const switchZone = useCallback((newZone) => {
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
    } catch(e) { return { ok: false, error: e.message }; }
  }, []);

  const loadSection = useCallback(async (sec) => {
    setSection(sec); setCategories([]); setItems([]); setSelectedCat(null); setSelectedItem(null);
    setIsPlaying(false); setSeriesData(null); AVPlayer.stop();
    
    if (sec === "Settings") { 
      switchZone("items");
      updateFocus("items", 0);
      api("/api/providers").then(j => { if(j.ok) setProviders(j.providers || []); });
      return; 
    }
    if (sec === "Favorites") { setItems(favorites); switchZone("items"); updateFocus("items", 0); return; }
    if (sec === "Search") { 
      switchZone("items"); updateFocus("items", 0);
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
      switchZone("categories");
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
      switchZone("categories");
      setStatus("Ready");
    } else { setStatus("Portal Error: " + (j.error || "Unknown")); }
  }, [favorites, api, switchZone, updateFocus]);

  const loadItems = useCallback(async (cat) => {
    if (!cat) return;
    setSelectedCat(cat); setItems([]); setStatus("Loading...");
    const id = idOf(cat);
    const cKey = `${section}_${id}`;
    const cached = Cache.get(cKey);
    if (cached) { 
      setItems(cached); 
      switchZone("items");
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
      switchZone("items");
      setStatus("Ready");
    }
  }, [section, api, switchZone]);

  const openSeries = useCallback(async (item) => {
    setStatus("Loading Series Info...");
    const j = await api(`/api/series-info?id=${item.id}`);
    if (j.ok) {
      if (j.seasons) {
        j.seasons.forEach(s => {
          if (s.episodes) s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        });
      }
      setSeriesData({ ...j, originalItem: item });
      switchZone("seasons");
      updateFocus("seasons", 0);
      setActiveSeasonIdx(0);
      setStatus("Series Ready");
    } else { setStatus("Error loading series"); }
  }, [api, switchZone, updateFocus]);

  const playItem = useCallback(async (item) => {
    if (!item) return;
    setSelectedItem(item);
    setStatus("Connecting...");
    let type = (section === "Media library") ? "vod" : "itv";
    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmdOf(item))}`);
    if (j.ok && j.url) {
      setIsPlaying(true); setIsPaused(false); setOverlay(true);
      switchZone("player");
      updateFocus("player", 0);
      AVPlayer.play(j.url, setStatus, (c, d) => setProgress({ current: c, duration: d }));
    } else { setStatus("Stream Error"); }
  }, [section, api, switchZone, updateFocus]);

  const playEpisode = useCallback(async (episode) => {
    setSelectedItem(episode);
    setStatus("Connecting Episode...");
    const season = seriesData.seasons[activeSeasonIdx];
    const j = await api(`/api/episode-link?series_id=${seriesData.id}&season_id=${season.id}&episode_id=${episode.id}`);
    if (j.ok && j.url) {
      setIsPlaying(true); setIsPaused(false); setOverlay(true);
      switchZone("player");
      updateFocus("player", 0);
      AVPlayer.play(j.url, setStatus, (c, d) => setProgress({ current: c, duration: d }));
    } else { setStatus("Episode Stream Error"); }
  }, [api, seriesData, activeSeasonIdx, switchZone, updateFocus]);

  const toggleFavorite = useCallback((item) => {
    if (!item) return;
    setFavorites(prev => {
      const isFav = prev.some(f => idOf(f) === idOf(item));
      const next = isFav ? prev.filter(f => idOf(f) !== idOf(item)) : [...prev, item];
      localStorage.setItem("favs", JSON.stringify(next));
      return next;
    });
  }, []);

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

      if (key === 10009 || key === 27) { // Return / ESC
        if (isPlaying) { 
           AVPlayer.stop(); setIsPlaying(false); 
           switchZone(seriesData ? "episodes" : "items"); 
           return; 
        }
        if (editingProvider) { setEditingProvider(null); updateFocus("items", 0); return; }
        if (seriesData) {
          if (navZone === "episodes") { switchZone("seasons"); return; }
          setSeriesData(null); switchZone("items"); return;
        }
        if (navZone === "items") { 
          if (["Settings", "Favorites", "Search"].includes(section)) {
            switchZone("menu");
          } else { switchZone("categories"); }
          return;
        }
        if (navZone === "categories") { switchZone("menu"); return; }
        return;
      }

      switch(key) {
        case 415: case 19: case 10252: if (isPlaying) { isPaused ? AVPlayer.resume() : AVPlayer.pause(); setIsPaused(!isPaused); } break;
        case 413: if (isPlaying) { AVPlayer.stop(); setIsPlaying(false); switchZone(seriesData ? "episodes" : "items"); } break;
        case 412: if (isPlaying) AVPlayer.seek(-30000); break;
        case 417: if (isPlaying) AVPlayer.seek(30000); break;
        case 31: setOverlay(true); break; 
        case 403: if (navZone === "items" && items[focusIndex]) toggleFavorite(items[focusIndex]); break;
        case 406: if (isPlaying) AVPlayer.setRatio(AVPlayer.ratio === "FIT" ? "FILL" : "FIT"); break;
      }

      let max = navZone === "menu" ? MENU.length : 
                navZone === "categories" ? (categories?.length || 0) + (section !== "Shows archive" ? 1 : 0) :
                navZone === "items" ? (section === "Settings" ? (editingProvider ? 10 : (providers?.length || 0) + 1) : (items?.length || 0)) :
                navZone === "player" ? 4 :
                navZone === "seasons" ? seriesData?.seasons?.length || 0 :
                navZone === "episodes" ? seriesData?.seasons[activeSeasonIdx]?.episodes?.length || 0 : 0;

      switch(key) {
        case 38: setFocusIndex(p => { const n = Math.max(0, p - 1); zoneIndices.current[navZone] = n; return n; }); break; // Up
        case 40: setFocusIndex(p => { const n = Math.min(max - 1, p + 1); zoneIndices.current[navZone] = n; return n; }); break; // Down
        case 37: // Left
          if (navZone === "episodes") switchZone("seasons");
          else if (navZone === "seasons") { setSeriesData(null); switchZone("items"); }
          else if (navZone === "items") { 
            if (["Settings", "Favorites", "Search"].includes(section)) switchZone("menu");
            else switchZone("categories");
          }
          else if (navZone === "categories" || navZone === "player") switchZone("menu");
          break;
        case 39: // Right
          if (navZone === "menu") { 
            if (["Settings", "Favorites", "Search"].includes(section)) switchZone("items");
            else if (categories?.length > 0) switchZone("categories");
          }
          else if (navZone === "categories" && items?.length > 0) switchZone("items");
          else if (navZone === "items" && isPlaying) switchZone("player");
          else if (navZone === "seasons") switchZone("episodes");
          break;
        case 13: // Enter
          if (navZone === "menu") loadSection(MENU[focusIndex].id);
          else if (navZone === "categories") {
            const hasAll = section !== "Shows archive";
            if (hasAll && focusIndex === 0) loadItems({ id: "*", title: "All Content" });
            else loadItems(categories[hasAll ? focusIndex - 1 : focusIndex]);
          } else if (navZone === "items") {
            const it = items[focusIndex];
            if (it.is_series == "1" || it.is_series === true) { openSeries(it); }
            else playItem(it);
          } else if (navZone === "seasons") {
            setActiveSeasonIdx(focusIndex); switchZone("episodes");
          } else if (navZone === "episodes") {
            playEpisode(seriesData.seasons[activeSeasonIdx].episodes[focusIndex]);
          } else if (navZone === "player") {
            if (focusIndex === 0) { isPaused ? AVPlayer.resume() : AVPlayer.pause(); setIsPaused(!isPaused); }
            if (focusIndex === 1) AVPlayer.seek(-30000);
            if (focusIndex === 2) AVPlayer.seek(30000);
            if (focusIndex === 3) setOverlay(false);
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navZone, focusIndex, categories, items, section, isPlaying, overlay, editingProvider, providers, isPaused, showOverlay, loadSection, loadItems, playItem, seriesData, activeSeasonIdx, openSeries, playEpisode, toggleFavorite, api, switchZone, updateFocus]);

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
        <div className="sidebar-footer"><Clock size={18} /> {new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
      </nav>

      {(categories?.length > 0 && !seriesData) && (
        <section className={`cat-panel ${navZone === "categories" ? "active-zone" : ""}`}>
          <div className="panel-header"><h3>Browse</h3></div>
          <div className="scroll-list">
            {section !== "Shows archive" && (
              <div className={`list-row ${selectedCat?.id === "*" ? "active" : ""} ${navZone === "categories" && focusIndex === 0 ? "focused" : ""}`}>All Content</div>
            )}
            {categories.map((c, i) => (
              <div key={i} className={`list-row ${ (selectedCat && idOf(selectedCat) === idOf(c)) ? "active" : ""} ${navZone === "categories" && focusIndex === (section !== "Shows archive" ? i + 1 : i) ? "focused" : ""}`}>{titleOf(c)}</div>
            ))}
          </div>
        </section>
      )}

      {seriesData && (
         <section className={`cat-panel active-zone`}>
            <div className="panel-header"><h3>Seasons</h3></div>
            <div className="scroll-list">
               {seriesData.seasons.map((s, i) => (
                 <div key={i} className={`list-row ${activeSeasonIdx === i ? "active" : ""} ${navZone === "seasons" && focusIndex === i ? "focused" : ""}`}>
                    Season {s.seasonNumber}
                 </div>
               ))}
            </div>
         </section>
      )}

      <main className={`content-area ${(navZone === "items" || navZone === "episodes") ? "active-zone" : ""}`}>
        <header className="main-header">
           <h1>{seriesData ? seriesData.originalItem.name : (selectedCat ? titleOf(selectedCat) : section)}</h1>
           <div className="status-badge"><Info size={14}/> {status}</div>
        </header>

        {seriesData && !isPlaying && (
          <div className="series-details-hero">
              <div className="hero-backdrop" style={{backgroundImage: `url(${thumbOf(seriesData.originalItem)})`}}></div>
              <img src={thumbOf(seriesData.originalItem)} className="hero-poster" alt="" />
              <div className="hero-overlay">
                <div className="hero-content">
                    <div className="hero-tags">
                      <span className="tag"><Calendar size={14}/> {seriesData.originalItem.year || "2024"}</span>
                      <span className="tag"><Star size={14} color="#f5c518" fill="#f5c518"/> {seriesData.originalItem.rating || "8.5"}</span>
                      <span className="tag hd">4K Ultra HD</span>
                    </div>
                    <p className="hero-plot">{seriesData.originalItem.description || seriesData.originalItem.info || "Streaming now in high definition. Enjoy premium cinematic experience."}</p>
                </div>
              </div>
          </div>
        )}

        <div className={`items-container ${(section === "Live streams" || seriesData) ? "list-mode" : "grid-mode"}`}>
          {seriesData ? (
            seriesData.seasons[activeSeasonIdx]?.episodes.map((ep, i) => (
              <div key={i} className={`item-card list-mode ${navZone === "episodes" && focusIndex === i ? "focused" : ""}`}>
                 <div className="ep-num">E{ep.episodeNumber.toString().padStart(2, '0')}</div>
                 <div className="ep-info">
                    <b className="ep-title">{ep.title}</b>
                    <span className="ep-meta">Streaming Available • 1080p</span>
                 </div>
                 <PlayCircle size={32} className="ep-play-icon" />
              </div>
            ))
          ) : (
            (items || []).map((it, i) => (
              <div key={i} className={`item-card ${ (selectedItem && idOf(selectedItem) === idOf(it)) ? "active" : ""} ${navZone === "items" && focusIndex === i ? "focused" : ""}`}>
                 {it.is_series == "1" || it.is_series === true ? (
                   <div className="card-inner">
                      <img src={thumbOf(it)} alt="" />
                      <div className="card-badge"><Layers size={14} /> SERIES</div>
                      <div className="card-content"><span>{titleOf(it)}</span></div>
                   </div>
                 ) : section !== "Live streams" ? (
                   <div className="card-inner"><img src={thumbOf(it)} alt="" /><div className="card-content">{titleOf(it)}</div></div>
                 ) : (
                   <div className="live-row"><span className="ch-num">{it.number || i+1}</span><b className="ch-title">{titleOf(it)}</b><span className="epg-hint">{it.epg_progname}</span></div>
                 )}
              </div>
            ))
          )}
        </div>
      </main>

      <div className={`full-player-ui ${isPlaying && overlay ? "visible" : ""}`}>
          <div className="player-controls">
              <h1 className="player-title">{titleOf(selectedItem)}</h1>
              <div className="player-progress-container">
                  <div className="progress-track"><div className="progress-fill" style={{width: `${(progress.current / (progress.duration || 1)) * 100}%`}}></div></div>
                  <div className="player-times"><span>{formatT(progress.current)}</span><span>{formatT(progress.duration)}</span></div>
              </div>
              <div className="player-actions">
                  <div className={`player-btn ${navZone === "player" && focusIndex === 0 ? "focused" : ""}`}>{isPaused ? <Play size={60} fill="white"/> : <Pause size={60} fill="white"/>}</div>
                  <div className={`player-btn ${navZone === "player" && focusIndex === 1 ? "focused" : ""}`}><RotateCcw size={50} /></div>
                  <div className={`player-btn ${navZone === "player" && focusIndex === 2 ? "focused" : ""}`}><RotateCw size={50} /></div>
                  <div className={`player-btn ${navZone === "player" && focusIndex === 3 ? "focused" : ""}`}><Maximize size={50} /></div>
              </div>
          </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);