import React, { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

const BACKEND = "";

const MENU = ["Live streams", "Shows archive", "Media library", "Radio stations", "Settings"];

function titleOf(x) {
  return x?.title || x?.name || x?.o_name || x?.fname || x?.tv_genre_name || x?.category_name || x?.genre_title || "No name";
}
function idOf(x) {
  return x?.id || x?.category_id || x?.genre_id || x?.tv_genre_id || x?.alias || "*";
}
function cmdOf(x) {
  return x?.cmd || x?.cmd_1 || x?.url || x?.stream_url || x?.file || x?.cmds?.[0]?.url || "";
}

function App() {
  const [section, setSection] = useState("Live streams");
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [playUrl, setPlayUrl] = useState("");

  // Focus Management State
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
    if (remembered !== undefined) {
      setFocusIndex(remembered);
    } else {
      setFocusIndex(0);
    }
  }, []);

  async function api(path) {
    try {
      const r = await fetch(BACKEND + path);
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
    setPlayUrl("");
    setStatus("Loading...");
    
    // Restore focus for the new section's menu position if we were in menu
    if (navZone === "menu") {
      setFocusIndex(MENU.indexOf(sec));
    } else {
      setNavZone("menu");
      setFocusIndex(MENU.indexOf(sec));
    }

    if (sec === "Settings") {
      setStatus("Backend: " + BACKEND);
      return;
    }

    let path = "/api/live-categories";
    if (sec === "Shows archive") path = "/api/archive-categories";
    if (sec === "Media library") path = "/api/media-library";
    if (sec === "Radio stations") path = "/api/radio";

    const j = await api(path);
    if (!j.ok) return setStatus("Failed: " + j.error);
    const arr = j.data || [];
    setCategories(arr);
    setStatus("Loaded " + arr.length);
  }, [navZone, rememberFocus]);

  const loadItems = useCallback(async (cat) => {
    rememberFocus();
    setSelectedCat(cat);
    setItems([]);
    setSelectedItem(null);
    setPlayUrl("");
    setStatus("Loading content...");

    const id = idOf(cat);
    let path = `/api/live-channels?genre=${encodeURIComponent(id)}`;
    if (section === "Shows archive") path = `/api/archive-list?genre=${encodeURIComponent(id)}`;
    if (section === "Media library") path = `/api/vod-list?category=${encodeURIComponent(id)}`;
    if (section === "Radio stations") path = `/api/radio-list?genre=${encodeURIComponent(id)}`;

    const j = await api(path);
    if (!j.ok) return setStatus("Failed: " + j.error);
    const arr = j.data || [];
    setItems(arr);
    setStatus("Loaded " + arr.length);
    
    // Switch to items zone and restore focus if any
    setNavZone("items");
    restoreFocus("items", section, cat);
  }, [section, rememberFocus, restoreFocus]);

  const playItem = useCallback(async (item) => {
    setSelectedItem(item);
    setStatus("Creating play link...");
    const cmd = cmdOf(item);
    if (!cmd) return setStatus("No play command found");

    let type = "itv";
    if (section === "Media library") type = "vod";
    if (section === "Radio stations") type = "radio";

    const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmd)}`);
    if (!j.ok || !j.url) return setStatus(j.error || "Play failed");
    setPlayUrl(j.url);
    setStatus("Playing");
  }, [section]);

  useEffect(() => { loadSection("Live streams"); }, []); // Initial load only

  // Remote Support Logic
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.keyCode || e.which;

      // Tizen Back: 10009, Escape: 27
      if (key === 10009 || key === 27) {
        if (navZone === "items") {
          rememberFocus();
          setNavZone("categories");
          restoreFocus("categories", section, selectedCat);
        } else if (navZone === "categories") {
          rememberFocus();
          setNavZone("menu");
          setFocusIndex(MENU.indexOf(section));
        }
        return;
      }

      let currentItemsCount = 0;
      if (navZone === "menu") currentItemsCount = MENU.length;
      if (navZone === "categories") currentItemsCount = categories.length + (section !== "Settings" && section !== "Shows archive" ? 1 : 0);
      if (navZone === "items") currentItemsCount = items.length;

      if (key === 38) { // Up
        setFocusIndex(prev => Math.max(0, prev - 1));
      } else if (key === 40) { // Down
        setFocusIndex(prev => Math.min(currentItemsCount - 1, prev + 1));
      } else if (key === 37) { // Left
        if (navZone === "items") {
          rememberFocus();
          setNavZone("categories");
          restoreFocus("categories", section, selectedCat);
        } else if (navZone === "categories") {
          rememberFocus();
          setNavZone("menu");
          setFocusIndex(MENU.indexOf(section));
        }
      } else if (key === 39) { // Right
        if (navZone === "menu") {
          if (categories.length > 0) {
            rememberFocus();
            setNavZone("categories");
            restoreFocus("categories", section, null);
          }
        } else if (navZone === "categories") {
          if (items.length > 0) {
            rememberFocus();
            // Enter logic will trigger loadItems which handles navZone/restoreFocus
            // But if we just want to jump right:
            const hasAll = section !== "Settings" && section !== "Shows archive";
            const cat = focusIndex === 0 && hasAll ? { id: "*", title: "All" } : categories[hasAll ? focusIndex - 1 : focusIndex];
            if (cat && (selectedCat === cat || (cat.id === "*" && selectedCat?.id === "*"))) {
              setNavZone("items");
              restoreFocus("items", section, selectedCat);
            }
          }
        }
      } else if (key === 13) { // Enter
        if (navZone === "menu") {
          loadSection(MENU[focusIndex]);
        } else if (navZone === "categories") {
          const hasAll = section !== "Settings" && section !== "Shows archive";
          if (hasAll && focusIndex === 0) {
            loadItems({ id: "*", title: "All" });
          } else {
            const cat = categories[hasAll ? focusIndex - 1 : focusIndex];
            if (section === "Shows archive") {
              playItem(cat);
            } else {
              loadItems(cat);
            }
          }
        } else if (navZone === "items") {
          playItem(items[focusIndex]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navZone, focusIndex, categories, items, section, selectedCat, loadSection, loadItems, playItem, rememberFocus, restoreFocus]);

  // Scroll focused element into view
  useEffect(() => {
    const focusedEl = document.querySelector(".focused");
    if (focusedEl) {
      focusedEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusIndex, navZone]);

  const renderCategories = () => {
    const hasAll = section !== "Settings" && section !== "Shows archive";
    const elements = [];
    if (hasAll) {
      elements.push(
        <div 
          key="all" 
          className={`row ${selectedCat?.id === "*" ? "active" : ""} ${navZone === "categories" && focusIndex === 0 ? "focused" : ""}`}
          onClick={() => loadItems({ id: "*", title: "All" })}
        >
          All
        </div>
      );
    }
    categories.forEach((c, i) => {
      const actualIndex = hasAll ? i + 1 : i;
      elements.push(
        <div 
          key={i} 
          className={`row ${selectedCat === c ? "active" : ""} ${navZone === "categories" && focusIndex === actualIndex ? "focused" : ""}`}
          onClick={() => section === "Shows archive" ? playItem(c) : loadItems(c)}
        >
          {titleOf(c)}
        </div>
      );
    });
    return elements;
  };

  return (
    <div className="app">
      <aside className={`side ${navZone === "menu" ? "focused-zone" : ""}`}>
        <div className="logo">
          <div className="icon"></div>
          <h1>STALKER TV</h1>
        </div>
        <div className="menu-list">
          {MENU.map((m, i) => (
            <button 
              key={m} 
              className={`menu ${section === m ? "active" : ""} ${navZone === "menu" && focusIndex === i ? "focused" : ""}`}
              onClick={() => loadSection(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </aside>

      <main className={`col ${navZone === "categories" ? "focused-zone" : ""}`}>
        <h2>{section}</h2>
        <div className="status">{status}</div>
        <div className="list">
          {renderCategories()}
        </div>
      </main>

      <section className={`col content ${navZone === "items" ? "focused-zone" : ""}`}>
        <div className="content-header">
          <h2>{selectedCat ? titleOf(selectedCat) : "Content"}</h2>
          <div className="time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>

        <div className="player-container">
          {playUrl ? (
            <video className="player" src={playUrl} controls autoPlay playsInline />
          ) : (
            <div className="player-placeholder">
              <div className="shimmer"></div>
              <span>Select content to start playback</span>
            </div>
          )}
        </div>

        <div className="list items-list">
          {items.map((it, i) => (
            <div 
              key={i} 
              className={`row ${selectedItem === it ? "active" : ""} ${navZone === "items" && focusIndex === i ? "focused" : ""}`}
              onClick={() => playItem(it)}
            >
              <span className="num">{(it.number || it.num || i + 1).toString().padStart(2, '0')}</span>
              <span className="title">{titleOf(it)}</span>
              {it.epg_progname && <span className="epg">{it.epg_progname}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);