const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

app.use(cors({ origin: "*" }));
app.use(express.json());

let PROVIDERS = [
  {
    id: "airtel4k",
    name: "Airtel 4K (Working)",
    portal: "http://portal.airtel4k.co/stalker_portal",
    mac: "00:1A:79:00:33:73",
    sn: "1F9D845D53937",
    deviceId: "E7850E9E868690599594841E585090CE4EC12ECAD35B56C33398B6CE4E4CB73A",
    deviceId2: "E7850E9E868690599594841E585090CE4EC12ECAD35B56C33398B6CE4E4CB73A",
    signature: "7ADA87DAB05B39942944F103E85277846B6292D0D2788AE896BA56406970E663"
  },
  {
    id: "tatasky",
    name: "TataSky Portal",
    portal: "http://play.tatasky.xyz/stalker_portal",
    mac: "00:1A:79:07:B2:B8",
    sn: "BAFDBC492E3DD",
    deviceId: "E13DBFB1CC4977AE6A6202606271DF6B801D2A7779AE301A732B86C98AC4E642",
    deviceId2: "E13DBFB1CC4977AE6A6202606271DF6B801D2A7779AE301A732B86C98AC4E642",
    signature: ""
  },
  { id: "p3", name: "Provider 3", portal: "", mac: "", sn: "", deviceId: "", deviceId2: "", signature: "" }
];

let currentIdx = 0;
let token = "";
let randomValue = "";

const USER_AGENT = "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 2 rev: 250 Safari/533.3";

function p() { return PROVIDERS[currentIdx]; }

// Persistent helper (for Railway memory survival during process life)
const saveProviders = () => { /* In a real app, write to disk/db. Here we keep in memory */ };

app.get("/api/providers", (req, res) => {
  res.json({ ok: true, providers: PROVIDERS.map((pr, i) => ({ ...pr, active: i === currentIdx })) });
});

app.post("/api/update-provider", (req, res) => {
  const { id, name, portal, mac, sn, deviceId, deviceId2, signature } = req.body;
  const idx = PROVIDERS.findIndex(pr => pr.id === id);
  if (idx === -1) return res.json({ ok: false, error: "Provider slot not found" });
  
  PROVIDERS[idx] = { ...PROVIDERS[idx], name, portal, mac, sn, deviceId, deviceId2, signature };
  saveProviders();
  res.json({ ok: true, message: "Saved" });
});

app.post("/api/select-provider", (req, res) => {
  const { id } = req.body;
  const idx = PROVIDERS.findIndex(pr => pr.id === id);
  if (idx === -1) return res.json({ ok: false, error: "Provider not found" });
  
  currentIdx = idx;
  token = ""; // Force re-auth
  res.json({ ok: true, active: p().name });
});

app.get(["/api/connect", "/connect"], async (req, res) => {
  try {
    const profile = await ensureAuth();
    res.json({ ok: true, token, profile, provider: p().name });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/live-categories", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "itv", action: "get_genres", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/live-channels", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const data = await stalkerRequest({ type: "itv", action: "get_ordered_list", genre, fav: "0", sortby: "number", hd: "0", p: "1", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/create-link", async (req, res) => {
  try {
    await ensureAuth();
    const cmd = req.query.cmd || "";
    const type = req.query.type || "itv";
    const data = await stalkerRequest({ type, action: "create_link", cmd, series: "0", forced_storage: "0", disable_ad: "0", download: "0", JsHttpRequest: "1-xml" }, true);
    const playUrl = extractUrl(data);
    res.json({ ok: !!playUrl, url: playUrl, error: playUrl ? "" : "No URL returned" });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/media-library", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "vod", action: "get_categories", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/vod-list", async (req, res) => {
  try {
    await ensureAuth();
    const category = req.query.category || "*";
    const data = await stalkerRequest({ type: "vod", action: "get_ordered_list", category, fav: "0", sortby: "added", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/radio", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "radio", action: "get_categories", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/tmdb/search", async (req, res) => {
  try {
    const title = req.query.title;
    if (!title || !TMDB_API_KEY) return res.json({ ok: false });
    const response = await axios.get("https://api.themoviedb.org/3/search/movie", { params: { api_key: TMDB_API_KEY, query: title } });
    const movie = response.data.results?.[0];
    if (!movie) return res.json({ ok: false });
    res.json({ ok: true, title: movie.title, overview: movie.overview, rating: movie.vote_average, poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "" });
  } catch (e) { res.json({ ok: false }); }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});

module.exports = app;