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
const thumbOf = (it) => it?.tmdb_poster || it?.screenshot || it?.logo || it?.tv_genre_logo || it?.poster || "";

const AVPlayer = {
  isAvailable: !!(window.webapis && window.webapis.avplay),
  el: null,
  init: function() {
    if (!this.isAvailable) return;
    try {
      const keys = ["MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "ChannelUp", "ChannelDown", "VolumeUp", "VolumeDown", "VolumeMute", "Info", "Guide", "Search", "Menu", "Source", "ColorRed", "ColorGreen", "ColorYellow", "ColorBlue"];
      keys.forEach(k => { try { window.tizen.tvinputdevice.registerKey(k); } catch(e){} });
      this.el = document.getElementById("av-player");
    } catch(e){}
  },
  play: function(url, onStatus, onProgress) {
    if (!this.isAvailable) return false;
    try {
      this.stop();
      window.webapis.avplay.open(url);
      window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      window.webapis.avplay.setListener({
        onbufferingstart: () => onStatus("Buffering..."),
        onbufferingcomplete: () => onStatus("Playing"),
        onerror: (e) => onStatus("AVPlayer Error: " + e),
        onpreparecomplete: () => { window.webapis.avplay.play(); },
        oncurrentplaytime: (t) => onProgress(t, window.webapis.avplay.getDuration())
      });
      window.webapis.avplay.prepareAsync();
      return true;
    } catch(e){ 
      console.error("AVPlayer Play Error", e);
      return false; 
    }
  },
  stop: function() { if(this.isAvailable){ try { window.webapis.avplay.stop(); } catch(e){} } },
  pause: function() { if(this.isAvailable){ try { window.webapis.avplay.pause(); } catch(e){} } },
  resume: function() { if(this.isAvailable){ try { window.webapis.avplay.play(); } catch(e){} } }
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
  const [playUrl, setPlayUrl] = useState("");
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
    setIsPlaying(false); setPlayUrl(""); setSeriesData(null); AVPlayer.stop();
    
    zoneIndices.current = { menu: zoneIndices.current.menu, categories: 0, items: 0, seasons: 0, episodes: 0, player: 0 };

    if (sec === "Settings") { switchZone("items"); api("/api/providers").then(j => { if(j.ok) setProviders(j.providers || []); }); return; }
    if (sec === "Favorites") { setItems(favorites); switchZone("items"); return; }
    
    const cached = Cache.get(sec);
    if (cached) { setCategories(cached); switchZone("categories"); setStatus("Ready"); return; }

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
    setSelectedCat(cat); setItems([]); setStatus(`Loading ${titleOf(cat)}...`);
    const id = idOf(cat);
    const cKey = `${section}_${id}`;
    const cached = Cache.get(cKey);
    if (cached) { setItems(cached); switchZone("items"); setStatus("Ready"); return; }
    
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

  const openSeries = useCallback(async (item) => {
    setStatus("Loading Series...");
    const j = await api(`/api/series-info?id=${item.id}`);
    if (j.ok) {
      if (j.seasons) j.seasons.forEach(s => { if (s.episodes) s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber); });
      setSeriesData({ ...j, originalItem: item });
      switchZone("seasons");
      setStatus("Series Ready");
    } else { setStatus("Series Error"); }
  }, [api, switchZone]);

  const playItem = useCallback(async (item) => {
    if (!item || typeof item === 'string') return;
    if (item.is_series == "1" || item.is_series === true) { openSeries(item); return; }
    setSelectedItem(item);
    setStatus("Connecting...");
    let type = (section === "Media library") ? "vod" : "itv";
    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmdOf(item))}`);
    if (j.ok && j.url) {
      setPlayUrl(j.url);
      setIsPlaying(true); 
      setOverlay(true); 
      const usedAV = AVPlayer.play(j.url, setStatus, (c, d) => setProgress({ current: c, duration: d }));
      if (usedAV) {
        switchZone("player");
      } else {
        // Fallback for browser testing or if AVPlayer fails
        setStatus("Playing (HTML5)");
        switchZone("player");
      }
    } else { setStatus("Stream Error"); }
  }, [section, api, switchZone, openSeries]);

  const playEpisode = useCallback(async (episode) => {
    setSelectedItem(episode);
    setStatus("Connecting Episode...");
    const season = seriesData.seasons[activeSeasonIdx];
    const j = await api(`/api/episode-link?series_id=${seriesData.id}&season_id=${season.id}&episode_id=${episode.id}`);
    if (j.ok && j.url) {
      setPlayUrl(j.url);
      setIsPlaying(true); setOverlay(true);
      const usedAV = AVPlayer.play(j.url, setStatus, (c, d) => setProgress({ current: c, duration: d }));
      if (!usedAV) setStatus("Playing Episode (HTML5)");
      switchZone("player");
    } else { setStatus("Episode Stream Error"); }
  }, [api, seriesData, activeSeasonIdx, switchZone]);

  useEffect(() => { AVPlayer.init(); loadSection("Live streams"); }, [loadSection]);

  const showOverlay = useCallback(() => {
    setOverlay(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => { if(isPlaying && navZone !== "player") setOverlay(false); }, 5000);
  }, [isPlaying, navZone]);

  useEffect(() => {
    const handleKey = (e) => {
      const key = e.keyCode || e.which;
      showOverlay();
      if ([37, 38, 39, 40, 13, 10009, 27, 415, 19, 413, 412, 417, 427, 428, 447, 448, 10153].includes(key)) e.preventDefault();

      if (key === 10009 || key === 27) { // Back
        if (isPlaying) { 
            AVPlayer.stop(); 
            setIsPlaying(false); 
            setPlayUrl("");
            switchZone(seriesData ? "episodes" : "items"); 
            return; 
        }
        if (seriesData) {
          if (navZone === "episodes") { switchZone("seasons"); return; }
          setSeriesData(null); switchZone("items"); return;
        }
        if (navZone === "items") { switchZone("categories"); return; }
        if (navZone === "categories") { switchZone("menu"); return; }
        return;
      }

      // Vol / CH
      switch(key) {
        case 447: try { window.tizen.tvaudio.setVolume(Math.min(100, window.tizen.tvaudio.getVolume() + 2)); } catch(e){} break;
        case 448: try { window.tizen.tvaudio.setVolume(Math.max(0, window.tizen.tvaudio.getVolume() - 2)); } catch(e){} break;
        case 10153: try { window.tizen.tvaudio.setMute(!window.tizen.tvaudio.isMute()); } catch(e){} break;
        case 427: if (navZone === "items" && focusIndex < items.length - 1) { setFocusIndex(p => p + 1); if (isPlaying) playItem(items[focusIndex + 1]); } break;
        case 428: if (navZone === "items" && focusIndex > 0) { setFocusIndex(p => p - 1); if (isPlaying) playItem(items[focusIndex - 1]); } break;
        case 415: case 19: if (isPlaying) { isPaused ? AVPlayer.resume() : AVPlayer.pause(); setIsPaused(!isPaused); } break;
        case 413: if (isPlaying) { AVPlayer.stop(); setIsPlaying(false); setPlayUrl(""); switchZone("items"); } break;
      }

      let max = navZone === "menu" ? MENU.length : 
                navZone === "categories" ? (categories?.length || 0) + (section !== "Shows archive" ? 1 : 0) :
                navZone === "items" ? (items?.length || 0) :
                navZone === "seasons" ? (seriesData?.seasons?.length || 0) :
                navZone === "episodes" ? (seriesData?.seasons[activeSeasonIdx]?.episodes?.length || 0) :
                navZone === "player" ? 4 : 0;

      switch(key) {
        case 38: setFocusIndex(p => { const n = Math.max(0, p - 1); zoneIndices.current[navZone] = n; return n; }); break;
        case 40: setFocusIndex(p => { const n = Math.min(max - 1, p + 1); zoneIndices.current[navZone] = n; return n; }); break;
        case 37: // Left
           if (navZone === "episodes") switchZone("seasons");
           else if (navZone === "seasons") { setSeriesData(null); switchZone("items"); }
           else if (navZone === "items") switchZone("categories");
           else if (navZone === "categories") switchZone("menu");
           break;
        case 39: // Right
           if (navZone === "menu") switchZone("categories");
           else if (navZone === "categories") switchZone("items");
           else if (navZone === "seasons") switchZone("episodes");
           break;
        case 13: // Enter
          if (navZone === "menu") loadSection(MENU[focusIndex].id);
          else if (navZone === "categories") {
            const hasAll = section !== "Shows archive";
            if (hasAll && focusIndex === 0) loadItems({ id: "*", title: "All Content" });
            else loadItems(categories[hasAll ? focusIndex - 1 : focusIndex]);
          } else if (navZone === "items") {
            playItem(items[focusIndex]);
          } else if (navZone === "seasons") {
            setActiveSeasonIdx(focusIndex); switchZone("episodes");
          } else if (navZone === "episodes") {
            playEpisode(seriesData.seasons[activeSeasonIdx].episodes[focusIndex]);
          } else if (navZone === "player") {
             if (focusIndex === 0) { isPaused ? AVPlayer.resume() : AVPlayer.pause(); setIsPaused(!isPaused); }
             if (focusIndex === 1) AVPlayer.seek(-30000);
             if (focusIndex === 2) AVPlayer.seek(30000);
             if (focusIndex === 3) { AVPlayer.stop(); setIsPlaying(false); setPlayUrl(""); switchZone("items"); }
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navZone, focusIndex, categories, items, section, isPlaying, isPaused, loadSection, loadItems, playItem, switchZone, showOverlay, seriesData, activeSeasonIdx, playEpisode]);

  useEffect(() => {
    const focused = document.querySelector('.focused');
    if (focused) focused.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  }, [focusIndex, navZone]);

  const formatT = (ms) => {
    const s = Math.floor((ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Cinematic Background Layer */}
      <div className={`bg-layer ${isPlaying ? "video-playing" : ""}`} />

      <div className={`app-shell ${isPlaying ? "video-playing" : ""}`}>
        
        {/* Background HTML5 Video Fallback */}
        {isPlaying && playUrl && (
          <video 
            src={playUrl} 
            autoPlay 
            controls={false}
            style={{ 
              position: 'fixed', inset: 0, width: '100%', height: '100%', 
              objectFit: 'contain', zIndex: -2, background: 'black' 
            }}
            onTimeUpdate={(e) => setProgress({ current: e.target.currentTime * 1000, duration: e.target.duration * 1000 })}
            onPlaying={() => setStatus("Playing (HTML5)")}
            onError={() => setStatus("HTML5 Video Error")}
          />
        )}

        <nav className={`sidebar ${navZone === "menu" ? "active-zone" : ""}`}>
          <div className="brand"><span>POOMANI TV</span></div>
          <div className="nav-links">
            {MENU.map((m, i) => (
              <div key={m.id} className={`nav-item ${section === m.id ? "current" : ""} ${navZone === "menu" && focusIndex === i ? "focused" : ""}`}>
                <m.icon size={32} /><span>{m.label}</span>
              </div>
            ))}
          </div>
        </nav>

        {categories.length > 0 && !seriesData && (
          <section className={`cat-panel ${navZone === "categories" ? "active-zone" : ""}`}>
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

        {seriesData && (
          <section className={`cat-panel ${navZone === "seasons" ? "active-zone" : ""}`}>
            <div className="panel-header"><h3>Seasons</h3></div>
            <div className="scroll-list">
              {seriesData.seasons.map((s, i) => (
                <div key={i} className={`list-row ${activeSeasonIdx === i ? "active" : ""} ${navZone === "seasons" && focusIndex === i ? "focused" : ""}`}>Season {s.seasonNumber}</div>
              ))}
            </div>
          </section>
        )}

        <main className={`content-area ${(navZone === "items" || navZone === "episodes") ? "active-zone" : ""}`}>
          <header className="main-header">
             <h1>{seriesData ? seriesData.originalItem.name : (selectedCat ? titleOf(selectedCat) : section)}</h1>
             <div className="status-badge">{status} | {navZone} [{focusIndex}]</div>
          </header>

          <div className={`items-container ${ (section === "Live streams" || navZone === "episodes") ? "list-mode" : "grid-mode"}`}>
            {seriesData ? (
               seriesData.seasons[activeSeasonIdx]?.episodes.map((ep, i) => (
                <div key={i} className={`item-card list-mode ${navZone === "episodes" && focusIndex === i ? "focused" : ""}`}>
                   <div className="live-row"><span className="ch-num">E{ep.episodeNumber}</span><b className="ch-title">{ep.title}</b></div>
                </div>
              ))
            ) : (
              items.map((it, i) => (
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
              ))
            )}
          </div>
        </main>

        <div className={`full-player-ui ${isPlaying && overlay ? "visible" : ""}`}>
            <div className="player-header"><h1 className="player-title">{titleOf(selectedItem)}</h1></div>
            <div className="player-controls-container">
                <div className="progress-track"><div className="progress-fill" style={{width: `${(progress.current / (progress.duration || 1)) * 100}%`}}></div></div>
                <div className="player-times"><span>{formatT(progress.current)}</span><span>{formatT(progress.duration)}</span></div>
                <div className="player-actions">
                    <div className={`player-btn ${navZone === "player" && focusIndex === 0 ? "focused" : ""}`}>{isPaused ? <Play size={80} fill="white"/> : <Pause size={80} fill="white"/>}</div>
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
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);