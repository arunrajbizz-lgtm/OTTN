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
  ChevronRight, 
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

function App() {
  const [section, setSection] = useState("Live streams");
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [playUrl, setPlayUrl] = useState("");
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem("favs") || "[]"));
  
  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [tmdbData, setTmdbData] = useState(null);

  // Focus Management
  const [navZone, setNavZone] = useState("menu");
  const [focusIndex, setFocusIndex] = useState(0);
  const lastFocusMemory = useRef({});

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
      console.error("API Error:", e);
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
    setPlayUrl("");
    setStatus("Loading...");
    setTmdbData(null);

    if (sec === "Favorites") {
      setItems(favorites);
      setNavZone("items");
      setFocusIndex(0);
      setStatus(`My List (${favorites.length})`);
      return;
    }

    if (sec === "Settings" || sec === "Search") {
      setNavZone("items");
      setFocusIndex(0);
      setStatus(sec === "Settings" ? "Config" : "Type to search...");
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
    setStatus(`${sec} - ${arr.length} categories`);
    
    setNavZone("categories");
    restoreFocus("categories", sec, null);
  }, [favorites, rememberFocus, restoreFocus]);

  const loadItems = useCallback(async (cat) => {
    rememberFocus();
    setSelectedCat(cat);
    setItems([]);
    setSelectedItem(null);
    setPlayUrl("");
    setStatus("Fetching content...");

    const id = idOf(cat);
    let path = `/api/live-channels?genre=${encodeURIComponent(id)}`;
    if (section === "Shows archive") path = `/api/archive-list?genre=${encodeURIComponent(id)}`;
    if (section === "Media library") path = `/api/vod-list?category=${encodeURIComponent(id)}`;
    if (section === "Radio stations") path = `/api/radio-list?genre=${encodeURIComponent(id)}`;

    const j = await api(path);
    if (!j.ok) return setStatus("Error: " + j.error);
    const arr = j.data || [];
    setItems(arr);
    setStatus(`${titleOf(cat)} - ${arr.length} items`);
    
    setNavZone("items");
    restoreFocus("items", section, cat);
  }, [section, rememberFocus, restoreFocus]);

  const playItem = useCallback(async (item) => {
    if (!item) return;
    setSelectedItem(item);
    setStatus("Connecting to stream...");
    const cmd = cmdOf(item);
    if (!cmd) return setStatus("Stream not available");

    let type = "itv";
    if (section === "Media library") type = "vod";
    if (section === "Radio stations") type = "radio";

    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmd)}`);
    if (!j.ok || !j.url) return setStatus(j.error || "Link failed");
    
    setPlayUrl(j.url);
    setStatus("Playing: " + titleOf(item));

    // Fetch TMDB Info for Movies
    if (section === "Media library") {
      const info = await api(`/api/tmdb/search?title=${encodeURIComponent(titleOf(item))}`);
      if (info.ok) setTmdbData(info);
    }
  }, [section]);

  const toggleFavorite = useCallback((item) => {
    const isFav = favorites.find(f => idOf(f) === idOf(item));
    let newFavs;
    if (isFav) {
      newFavs = favorites.filter(f => idOf(f) !== idOf(item));
    } else {
      newFavs = [...favorites, item];
    }
    setFavorites(newFavs);
    localStorage.setItem("favs", JSON.stringify(newFavs));
  }, [favorites]);

  useEffect(() => { loadSection("Live streams"); }, []);

  // Remote Control Handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.keyCode || e.which;
      
      // Navigation counts
      let count = 0;
      if (navZone === "menu") count = MENU.length;
      if (navZone === "categories") count = categories.length + (section !== "Shows archive" ? 1 : 0);
      if (navZone === "items") count = items.length;

      // Back / Escape
      if (key === 10009 || key === 27) {
        if (navZone === "items") {
          if (section === "Favorites" || section === "Settings" || section === "Search") {
            setNavZone("menu");
            setFocusIndex(MENU.findIndex(m => m.id === section));
          } else {
            setNavZone("categories");
            restoreFocus("categories", section, selectedCat);
          }
        } else if (navZone === "categories") {
          setNavZone("menu");
          setFocusIndex(MENU.findIndex(m => m.id === section));
        }
        return;
      }

      switch (key) {
        case 38: // Up
          setFocusIndex(p => Math.max(0, p - 1));
          break;
        case 40: // Down
          setFocusIndex(p => Math.min(count - 1, p + 1));
          break;
        case 37: // Left
          if (navZone === "items" && section !== "Favorites" && section !== "Settings" && section !== "Search") {
            setNavZone("categories");
            restoreFocus("categories", section, selectedCat);
          } else if (navZone !== "menu") {
            setNavZone("menu");
            setFocusIndex(MENU.findIndex(m => m.id === section));
          }
          break;
        case 39: // Right
          if (navZone === "menu") {
            if (section === "Favorites" || section === "Settings" || section === "Search") {
              setNavZone("items");
              restoreFocus("items", section, null);
            } else if (categories.length > 0) {
              setNavZone("categories");
              restoreFocus("categories", section, null);
            }
          } else if (navZone === "categories") {
            if (items.length > 0) {
              setNavZone("items");
              restoreFocus("items", section, selectedCat);
            }
          }
          break;
        case 13: // Enter
          if (navZone === "menu") {
            loadSection(MENU[focusIndex].id);
          } else if (navZone === "categories") {
            const hasAll = section !== "Shows archive";
            if (hasAll && focusIndex === 0) {
              loadItems({ id: "*", title: "All Channels" });
            } else {
              const cat = categories[hasAll ? focusIndex - 1 : focusIndex];
              if (section === "Shows archive") playItem(cat);
              else loadItems(cat);
            }
          } else if (navZone === "items") {
            playItem(items[focusIndex]);
          }
          break;
        case 415: // Play
        case 19:  // Pause
          if (playUrl) {
            const v = document.querySelector("video");
            if (v) v.paused ? v.play() : v.pause();
          }
          break;
        case 33: // Page Up (Yellow/Fav toggle usually)
          if (navZone === "items" && items[focusIndex]) {
            toggleFavorite(items[focusIndex]);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navZone, focusIndex, categories, items, section, selectedCat, favorites, loadSection, loadItems, playItem, restoreFocus, toggleFavorite, playUrl]);

  // Scroll into view
  useEffect(() => {
    const el = document.querySelector(".focused");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusIndex, navZone]);

  const gridItems = useMemo(() => {
    if (section === "Live streams" || section === "Radio stations") return false;
    return true;
  }, [section]);

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className={`sidebar ${navZone === "menu" ? "active-zone" : ""}`}>
        <div className="brand">
          <div className="brand-logo"><Tv /></div>
          <span>POOMANI TV</span>
        </div>
        
        <div className="nav-links">
          {MENU.map((m, i) => (
            <div 
              key={m.id}
              className={`nav-item ${section === m.id ? "current" : ""} ${navZone === "menu" && focusIndex === i ? "focused" : ""}`}
            >
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

      {/* Categories Column */}
      {categories.length > 0 && (
        <section className={`cat-panel ${navZone === "categories" ? "active-zone" : ""}`}>
          <div className="panel-header">
            <h3>Categories</h3>
          </div>
          <div className="scroll-list">
            {section !== "Shows archive" && (
              <div className={`list-row ${selectedCat?.id === "*" ? "active" : ""} ${navZone === "categories" && focusIndex === 0 ? "focused" : ""}`}>
                All Content
              </div>
            )}
            {categories.map((c, i) => {
              const idx = section !== "Shows archive" ? i + 1 : i;
              return (
                <div 
                  key={i}
                  className={`list-row ${selectedCat === c ? "active" : ""} ${navZone === "categories" && focusIndex === idx ? "focused" : ""}`}
                >
                  {titleOf(c)}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className={`content-area ${navZone === "items" ? "active-zone" : ""}`}>
        <header className="main-header">
          <div className="header-info">
            <h1>{section === "Favorites" ? "My Favorites" : (selectedCat ? titleOf(selectedCat) : section)}</h1>
            <div className={`status-badge ${status.startsWith("Error") ? "error" : ""}`}>
              {status.startsWith("Error") ? <AlertCircle size={14}/> : <Info size={14}/>}
              {status}
            </div>
          </div>
        </header>

        {/* Video Player */}
        <div className="player-wrapper">
          {playUrl ? (
            <video className="main-player" src={playUrl} autoPlay controls />
          ) : (
            <div className="player-empty">
              <Play size={64} className="play-icon" />
              <span>Select an item to watch</span>
            </div>
          )}
          
          {selectedItem && (
            <div className="overlay-info">
              <div className="meta">
                <span className="channel-num">#{selectedItem.number || "00"}</span>
                <h2>{titleOf(selectedItem)}</h2>
              </div>
              {tmdbData?.ok && (
                <div className="tmdb-mini">
                  <div className="rating"><Star size={16} fill="gold" color="gold"/> {tmdbData.rating}</div>
                  <p>{tmdbData.overview?.substring(0, 150)}...</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Items List/Grid */}
        <div className={`items-container ${gridItems ? "grid-mode" : "list-mode"}`}>
          {items.map((it, i) => {
            const isFav = favorites.some(f => idOf(f) === idOf(it));
            return (
              <div 
                key={i}
                className={`item-card ${selectedItem === it ? "active" : ""} ${navZone === "items" && focusIndex === i ? "focused" : ""}`}
              >
                {gridItems ? (
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