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

function getHeaders(useAuth = false) {
  const headers = {
    "User-Agent": USER_AGENT,
    "X-User-Agent": "Model: MAG250; Link: WiFi",
    Referer: `${p().portal}/c/`,
    Origin: p().portal,
    Cookie: `mac=${p().mac}; stb_lang=en; timezone=Asia/Kolkata`,
    Accept: "*/*",
    Connection: "Keep-Alive",
  };
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function stalkerRequest(params, useAuth = false) {
  const action = params.action || params.type;
  try {
    const res = await axios.get(`${p().portal}/server/load.php`, {
      params,
      headers: getHeaders(useAuth),
      timeout: 30000,
      validateStatus: () => true,
    });

    let data = res.data;
    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed.startsWith("<")) {
        console.error(`[Portal] ${p().name} returned HTML (Blocked?)`);
        throw new Error("Portal returned HTML");
      }
      try {
        data = JSON.parse(trimmed);
      } catch (e) {
        console.warn(`[Portal] ${p().name} returned non-JSON string: ${trimmed.substring(0, 100)}`);
        data = { raw_text: trimmed };
      }
    }
    return data;
  } catch (err) {
    console.error(`[Portal] ${p().name} Request Error (${action}):`, err.message);
    throw err;
  }
}

async function doHandshake() {
  console.log(`[Auth] ${p().name} Handshake Start...`);
  const data = await stalkerRequest({ type: "stb", action: "handshake", token: "", JsHttpRequest: "1-xml" });
  token = data?.js?.token || data?.token || "";
  randomValue = data?.js?.random || data?.random || "";
  
  if (!token) {
    console.error(`[Auth] ${p().name} Handshake Failed. Response:`, JSON.stringify(data));
    throw new Error("Handshake failed");
  }
  console.log(`[Auth] ${p().name} Handshake Success`);
  return data;
}

async function getProfile() {
  if (!token) await doHandshake();
  return await stalkerRequest({
    type: "stb",
    action: "get_profile",
    hd: "1",
    ver: "ImageDescription: 0.2.18-r22-pub-270; ImageDate: Tue Dec 19 11:33:53 EET 2017; PORTAL version: 5.6.1; API Version: JS API version: 328; STB API version: 134; Player Engine version: 0x566",
    num_banks: "2",
    sn: p().sn,
    stb_type: "MAG250",
    image_version: "218",
    video_out: "hdmi",
    device_id: p().deviceId,
    device_id2: p().deviceId2,
    signature: p().signature,
    auth_second_step: "1",
    hw_version: "1.7-BD-00",
    not_valid_token: "0",
    client_type: "STB",
    hw_version_2: p().deviceId.toLowerCase(),
    timestamp: Math.floor(Date.now() / 1000),
    api_signature: "263",
    metrics: JSON.stringify({ mac: p().mac, sn: p().sn, model: "MAG250", type: "STB", uid: p().deviceId, random: randomValue }),
    JsHttpRequest: "1-xml",
  }, true);
}

async function ensureAuth() {
  token = "";
  randomValue = "";
  await doHandshake();
  return await getProfile();
}

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.js)) return data.js;
  if (Array.isArray(data?.js?.data)) return data.js.data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function extractUrl(data) {
  let cmd = data?.js?.cmd || data?.js?.url || data?.js?.data?.cmd || data?.cmd || data?.data?.cmd || data?.results || "";
  if (typeof data?.js === "string" && data.js.startsWith("http")) cmd = data.js;
  return String(cmd).trim().replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim();
}

// Routes
app.get("/", (req, res) => res.send(`POOMANI TV Active: ${p().name}`));
app.get("/health", (req, res) => res.json({ status: "ok", active: p().name }));

app.get("/api/test-portal", async (req, res) => {
  try {
    const r = await axios.get(p().portal, { timeout: 10000 });
    res.json({ ok: true, status: r.status, provider: p().name, url: p().portal });
  } catch (e) {
    res.json({ ok: false, error: e.message, provider: p().name, url: p().portal });
  }
});

app.get("/api/providers", (req, res) => {
  console.log("[Route] GET /api/providers");
  try {
    const list = PROVIDERS.map((pr, i) => ({ ...pr, active: i === currentIdx }));
    res.json({ ok: true, providers: list });
  } catch (e) {
    console.error("[Route] providers error:", e.message);
    res.json({ ok: false, error: e.message });
  }
});

app.post("/api/update-provider", (req, res) => {
  const { id, name, portal, mac, sn, deviceId, deviceId2, signature } = req.body;
  const idx = PROVIDERS.findIndex(pr => pr.id === id);
  if (idx === -1) return res.json({ ok: false, error: "Provider slot not found" });
  PROVIDERS[idx] = { ...PROVIDERS[idx], name, portal, mac, sn, deviceId, deviceId2, signature };
  res.json({ ok: true, message: "Saved" });
});

app.post("/api/select-provider", (req, res) => {
  const { id } = req.body;
  const idx = PROVIDERS.findIndex(pr => pr.id === id);
  if (idx === -1) return res.json({ ok: false, error: "Provider not found" });
  currentIdx = idx;
  token = "";
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
    const data = await stalkerRequest({ type: "itv", action: "get_ordered_list", genre, fav: "0", sortby: "number", hd: "0", p: "1", num: "1000", JsHttpRequest: "1-xml" }, true);
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
    const data = await stalkerRequest({ type: "vod", action: "get_ordered_list", category, fav: "0", sortby: "added", p: "1", num: "1000", JsHttpRequest: "1-xml" }, true);
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

app.get("/api/radio-list", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const data = await stalkerRequest({ type: "radio", action: "get_ordered_list", genre, JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/archive-categories", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "itv", action: "get_genres", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/archive-list", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const data = await stalkerRequest({ type: "itv", action: "get_ordered_list", genre, JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
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
    const results = [...normalizeArray(live), ...normalizeArray(vod)];
    res.json({ ok: true, data: results });
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