import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

const BACKEND = "https://ottn-production.up.railway.app";

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

  async function api(path) {
    const r = await fetch(BACKEND + path);
    return await r.json();
  }

  async function loadSection(sec) {
    setSection(sec);
    setCategories([]);
    setItems([]);
    setSelectedCat(null);
    setSelectedItem(null);
    setPlayUrl("");
    setStatus("Loading...");

    if (sec === "Settings") {
      setStatus("Backend: " + BACKEND);
      return;
    }

    let path = "/api/live-categories";
    if (sec === "Shows archive") path = "/api/archive-categories";
    if (sec === "Media library") path = "/api/media-library";
    if (sec === "Radio stations") path = "/api/radio";

    try {
      const j = await api(path);
      console.log("SECTION", sec, j);
      if (!j.ok) return setStatus("Failed: " + j.error);
      const arr = j.data || [];
      setCategories(arr);
      setStatus("Loaded " + arr.length);
    } catch (e) {
      setStatus("Failed: " + e.message);
    }
  }

  async function loadItems(cat) {
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

    try {
      const j = await api(path);
      console.log("ITEMS", section, j);
      if (!j.ok) return setStatus("Failed: " + j.error);
      const arr = j.data || [];
      setItems(arr);
      setStatus("Loaded " + arr.length);
    } catch (e) {
      setStatus("Failed: " + e.message);
    }
  }

  async function playItem(item) {
    setSelectedItem(item);
    setStatus("Creating play link...");
    const cmd = cmdOf(item);
    if (!cmd) return setStatus("No play command found");

    let type = "itv";
    if (section === "Media library") type = "vod";
    if (section === "Radio stations") type = "radio";

    try {
      const j = await api(`/api/create-link?type=${type}&cmd=${encodeURIComponent(cmd)}`);
      console.log("PLAY", j);
      if (!j.ok || !j.url) return setStatus(j.error || "Play failed");
      setPlayUrl(j.url);
      setStatus("Playing");
    } catch (e) {
      setStatus("Play failed: " + e.message);
    }
  }

  useEffect(() => { loadSection("Live streams"); }, []);

  return (
    <div className="app">
      <aside className="side">
        <h1>OTT Navigator</h1>
        {MENU.map(m => (
          <button key={m} className={section === m ? "menu active" : "menu"} onClick={() => loadSection(m)}>
            {m}
          </button>
        ))}
      </aside>

      <main className="col">
        <h2>{section}</h2>
        <div className="status">{status}</div>

        {section !== "Settings" && section !== "Shows archive" && (
          <div className={!selectedCat ? "row active" : "row"} onClick={() => loadItems({ id: "*", title: "All" })}>
            All
          </div>
        )}

        {categories.map((c, i) => (
          <div key={i} className={selectedCat === c ? "row active" : "row"} onClick={() => section === "Shows archive" ? playItem(c) : loadItems(c)}>
            {titleOf(c)}
          </div>
        ))}
      </main>

      <section className="col content">
        <h2>{selectedCat ? titleOf(selectedCat) : "Content"}</h2>

        {playUrl && <video className="player" src={playUrl} controls autoPlay playsInline />}

        <div className="list">
          {items.map((it, i) => (
            <div key={i} className={selectedItem === it ? "row active" : "row"} onClick={() => playItem(it)}>
              <span className="num">{it.number || it.num || i + 1}</span>
              <span>{titleOf(it)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);