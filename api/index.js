const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

const path = require("path");

app.use(cors());
app.use(express.json());

// Test Endpoint
app.get("/api/test", (req, res) => res.json({ ok: true, message: "Backend is reachable" }));

// Serve Static Frontend Files
const distPath = path.join(__dirname, "../frontend/dist");
app.use(express.static(distPath));

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
  }
];

let currentIdx = 0; 
let token = "";
let randomValue = "";

const USER_AGENT = "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 2 rev: 250 Safari/533.3";

function p() { return PROVIDERS[currentIdx]; }

function getHeaders(useAuth = false) {
  const headers = {
    "User-Agent": USER_AGENT,
    "X-User-Agent": "Model: MAG250; Link: WiFi",
    "Referer": `${p().portal}/c/index.html`,
    "Cookie": `mac=${p().mac}; stb_lang=en; timezone=Asia/Kolkata`,
    "Accept": "*/*",
    "Connection": "Keep-Alive",
  };
  if (useAuth && token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function stalkerRequest(params, useAuth = false) {
  const url = `${p().portal}/server/load.php`;
  console.log(`[Portal] Request: ${params.action} for ${p().name} (Auth: ${useAuth})`);
  try {
    const res = await axios.get(url, {
      params,
      headers: getHeaders(useAuth),
      timeout: 30000,
      validateStatus: () => true,
    });
    let data = res.data;
    console.log(`[Portal] Response Status: ${res.status} for ${params.action}`);
    if (typeof data === "string") {
      const trimmed = data.trim();
      try { 
        data = JSON.parse(trimmed); 
      } catch (e) { 
        console.warn(`[Portal] Failed to parse JSON from ${params.action}. Raw sample: ${trimmed.substring(0, 100)}`);
        data = { raw_text: trimmed }; 
      }
    }
    return data;
  } catch (err) {
    console.error(`[Portal] Request Error (${url}):`, err.message);
    throw err;
  }
}

async function doHandshake() {
  console.log(`[Handshake] Starting for ${p().name}...`);
  const handshakeParams = { 
    type: "stb", 
    action: "handshake", 
    token: "", 
    mac: p().mac,
    stb_type: "MAG250",
    JsHttpRequest: "1-xml" 
  };
  let data = await stalkerRequest(handshakeParams);
  if (!data || data.js === false || (!data.js?.token && !data?.token)) {
      console.warn("[Handshake] Strategy 1 failed or returned no token, trying Strategy 2...");
      data = await stalkerRequest({ type: "stb", action: "handshake", token: "" });
  }
  token = data?.js?.token || data?.token || data?.results?.token || "";
  randomValue = data?.js?.random || data?.random || data?.results?.random || "";
  
  if (!token) {
    console.error("[Handshake] FAILED. Response:", JSON.stringify(data));
    throw new Error(`Handshake failed: ${JSON.stringify(data).substring(0, 100)}`);
  }
  console.log(`[Handshake] SUCCESS. Token: ${token.substring(0, 8)}...`);
  return data;
}

async function getProfile() {
  console.log(`[Profile] Fetching for ${p().name}...`);
  if (!token) await doHandshake();
  const data = await stalkerRequest({
    type: "stb",
    action: "get_profile",
    hd: "1",
    sn: p().sn,
    stb_type: "MAG250",
    device_id: p().deviceId,
    device_id2: p().deviceId2,
    signature: p().signature,
    timestamp: Math.floor(Date.now() / 1000),
    metrics: JSON.stringify({ mac: p().mac, sn: p().sn, model: "MAG250", uid: p().deviceId, random: randomValue }),
    JsHttpRequest: "1-xml",
  }, true);
  
  const ok = data?.js || data?.id || data?.data;
  console.log(`[Profile] Result for ${p().name}: ${ok ? "OK" : "FAILED"}`);
  if (!ok) console.warn("[Profile] Response was unexpected:", JSON.stringify(data).substring(0, 200));
  return data;
}

let isAuthenticating = false;
let authPromise = null;

async function ensureAuth() {
  if (token) return; 
  if (isAuthenticating) return authPromise;

  console.log(`[Auth] No token found, initiating full auth flow for ${p().name}`);
  isAuthenticating = true;
  authPromise = getProfile().finally(() => {
    isAuthenticating = false;
    authPromise = null;
  });
  return authPromise;
}

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.js)) return data.js;
  if (Array.isArray(data?.js?.data)) return data.js.data;
  if (Array.isArray(data?.data)) return data.data;
  if (typeof data?.js === 'object' && data.js !== null) return Object.values(data.js).filter(x => typeof x === 'object');
  return [];
}

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  const oldJson = res.json;
  res.json = function(data) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${data.ok ? "SUCCESS" : "ERROR: " + (data.error || "unknown")}`);
    return oldJson.apply(res, arguments);
  };
  next();
});

// Routes
app.get("/api/status", (req, res) => {
  res.json({ 
    ok: true, 
    provider: p().name, 
    hasToken: !!token, 
    timestamp: new Date().toISOString(),
    currentIdx
  });
});

app.get("/api/providers", (req, res) => {
  res.json({ ok: true, providers: PROVIDERS, currentIdx });
});

app.post("/api/providers/select", (req, res) => {
  const { index } = req.body;
  if (index >= 0 && index < PROVIDERS.length) {
    currentIdx = index;
    token = ""; // Reset token on provider change
    res.json({ ok: true, provider: PROVIDERS[currentIdx].name });
  } else {
    res.json({ ok: false, error: "Invalid index" });
  }
});

app.get("/api/connect", async (req, res) => {
  try { await ensureAuth(); res.json({ ok: true, token, provider: p().name }); } 
  catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/live-categories", async (req, res) => {
  try {
    await ensureAuth();
    const raw = await stalkerRequest({ type: "itv", action: "get_genres", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/media-library", async (req, res) => {
  try {
    await ensureAuth();
    console.log("[VOD] Fetching categories for", p().name);
    
    // Strategy 1: get_categories
    let raw = await stalkerRequest({ type: "vod", action: "get_categories", JsHttpRequest: "1-xml" }, true);
    let data = normalizeArray(raw);

    // Strategy 2: get_genres
    if (data.length === 0) {
      console.warn("[VOD] Strategy 1 (get_categories) returned nothing, trying Strategy 2 (get_genres)");
      raw = await stalkerRequest({ type: "vod", action: "get_genres", JsHttpRequest: "1-xml" }, true);
      data = normalizeArray(raw);
    }

    // Strategy 3: get_ordered_list with category=0 (Special discovery)
    if (data.length === 0) {
        console.warn("[VOD] Strategy 2 failed, trying get_ordered_list discovery");
        raw = await stalkerRequest({ type: "vod", action: "get_ordered_list", JsHttpRequest: "1-xml" }, true);
        const items = normalizeArray(raw);
        const cats = {};
        items.forEach(it => {
            if (it.category_id && it.category_id !== "0") {
                cats[it.category_id] = it.category_name || `Category ${it.category_id}`;
            }
        });
        data = Object.keys(cats).map(id => ({ id, title: cats[id], category_id: id }));
    }

    res.json({ ok: true, data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/vod-list", async (req, res) => {
  try {
    await ensureAuth();
    const { category = "*", movie_id, season_id } = req.query;
    const params = { type: "vod", action: "get_ordered_list", category, p: "1", num: "1000", JsHttpRequest: "1-xml" };
    if (movie_id) params.movie_id = movie_id;
    if (season_id) params.season_id = season_id;
    const raw = await stalkerRequest(params, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/series-info", async (req, res) => {
  try {
    await ensureAuth();
    const movie_id = req.query.id;
    const rawSeasons = await stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id, JsHttpRequest: "1-xml" }, true);
    const seasonsArr = normalizeArray(rawSeasons);
    
    const seasons = [];
    for (const s of seasonsArr) {
      if (!s.id || !s.is_season) continue;
      const rawEpisodes = await stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id, season_id: s.id, JsHttpRequest: "1-xml" }, true);
      const episodesArr = normalizeArray(rawEpisodes);
      seasons.push({
        id: s.id,
        seasonNumber: parseInt(s.season_number || 1),
        episodes: episodesArr.map(e => ({
          id: e.id,
          episodeNumber: parseInt(e.series_number || 0),
          title: e.name || e.title || `Episode ${e.series_number}`,
          cmd: e.cmd
        }))
      });
    }
    res.json({ ok: true, id: movie_id, seasons });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/episode-link", async (req, res) => {
  try {
    await ensureAuth();
    const { series_id, season_id, episode_id } = req.query;
    const rawEpisode = await stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id: series_id, season_id, episode_id, JsHttpRequest: "1-xml" }, true);
    const episodes = normalizeArray(rawEpisode);
    const episode = episodes[0];
    if (!episode || !episode.cmd) throw new Error("Missing episode command");
    
    const rawLink = await stalkerRequest({ type: "vod", action: "create_link", cmd: episode.cmd, series: "2", JsHttpRequest: "1-xml" }, true);
    const js = rawLink?.js || {};
    let url = js.cmd || js.url || rawLink.cmd || rawLink.url || "";
    res.json({ ok: !!url, url: String(url).replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim() });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/radio", async (req, res) => {
  try {
    await ensureAuth();
    const raw = await stalkerRequest({ type: "radio", action: "get_categories", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/radio-list", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const raw = await stalkerRequest({ type: "radio", action: "get_ordered_list", genre, JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/archive-categories", async (req, res) => {
  try {
    await ensureAuth();
    const raw = await stalkerRequest({ type: "itv", action: "get_genres", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/archive-list", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const raw = await stalkerRequest({ type: "itv", action: "get_ordered_list", genre, JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/live-channels", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    let raw = await stalkerRequest({ type: "itv", action: "get_ordered_list", genre, p: "1", num: "1000", JsHttpRequest: "1-xml" }, true);
    let data = normalizeArray(raw);
    if (data.length === 0 && genre === "*") {
        raw = await stalkerRequest({ type: "itv", action: "get_all_channels", JsHttpRequest: "1-xml" }, true);
        data = normalizeArray(raw);
    }
    res.json({ ok: true, data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/create-link", async (req, res) => {
  try {
    await ensureAuth();
    const raw = await stalkerRequest({ type: req.query.type || "itv", action: "create_link", cmd: req.query.cmd, JsHttpRequest: "1-xml" }, true);
    const js = raw?.js || {};
    let url = js.cmd || js.url || raw.cmd || raw.url || "";
    res.json({ ok: !!url, url: String(url).replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim() });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/search", async (req, res) => {
  try {
    await ensureAuth();
    const q = req.query.q || "";
    const [live, vod] = await Promise.all([
      stalkerRequest({ type: "itv", action: "get_ordered_list", search: q, JsHttpRequest: "1-xml" }, true),
      stalkerRequest({ type: "vod", action: "get_ordered_list", search: q, JsHttpRequest: "1-xml" }, true)
    ]);
    res.json({ ok: true, data: [...normalizeArray(live), ...normalizeArray(vod)] });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

// Catch-all to serve index.html for SPA (Express 5 / path-to-regexp v8 compatible)
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => console.log(`Backend on ${PORT}`));
module.exports = app;