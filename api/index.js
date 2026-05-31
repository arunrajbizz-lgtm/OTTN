const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

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
    "Referer": `${p().portal}/c/`,
    "Origin": p().portal,
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
      params: { ...params, JsHttpRequest: "1-xml" },
      headers: getHeaders(useAuth),
      timeout: 30000,
      validateStatus: () => true,
    });
    let data = res.data;
    console.log(`[Portal] Response Status: ${res.status} for ${params.action}`);
    
    if (typeof data === "string") {
      let trimmed = data.trim();
      const firstBrace = trimmed.search(/[\{\[]/);
      if (firstBrace > 0) {
        trimmed = trimmed.substring(firstBrace).trim();
      }
      try { 
        data = JSON.parse(trimmed); 
      } catch (e) { 
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
  const data = await stalkerRequest({ type: "stb", action: "handshake", token: "" });
  token = data?.js?.token || data?.token || data?.results?.token || "";
  randomValue = data?.js?.random || data?.random || data?.results?.random || "";
  
  if (!token) throw new Error("Handshake failed");
  console.log(`[Handshake] SUCCESS. Token: ${token.substring(0, 8)}...`);
  return data;
}

async function getProfile() {
  console.log(`[Profile] Fetching for ${p().name}...`);
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
  }, true);
}

async function ensureAuth() {
  token = "";
  randomValue = "";
  await doHandshake();
  return await getProfile();
}

function normalizeArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const obj = data.js || data.results || data.data || data;
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj?.data)) return obj.data;
  if (Array.isArray(obj?.js)) return obj.js;
  if (typeof obj === 'object' && obj !== null) {
    const vals = Object.values(obj);
    if (vals.length > 0 && typeof vals[0] === 'object') {
      return vals.filter(x => x !== null && typeof x === 'object' && (x.id || x.name || x.title || x.cmd));
    }
  }
  return [];
}

function extractUrl(data) {
  let cmd = data?.js?.cmd || data?.js?.data?.cmd || data?.cmd || data?.data?.cmd || "";
  cmd = String(cmd).trim();
  return cmd.replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim();
}

// Routes
app.get("/api/status", (req, res) => {
  res.json({ ok: true, provider: p().name, hasToken: !!token, currentIdx });
});

app.get("/api/providers", (req, res) => {
  res.json({ ok: true, providers: PROVIDERS, currentIdx });
});

app.post("/api/providers/select", (req, res) => {
  const { index } = req.body;
  if (index >= 0 && index < PROVIDERS.length) {
    currentIdx = index;
    token = ""; 
    res.json({ ok: true, provider: PROVIDERS[currentIdx].name });
  } else {
    res.json({ ok: false, error: "Invalid index" });
  }
});

app.get("/api/live-categories", async (req, res) => {
  try {
    await ensureAuth();
    const raw = await stalkerRequest({ type: "itv", action: "get_genres" }, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/live-channels", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const raw = await stalkerRequest({ 
      type: "itv", 
      action: "get_ordered_list", 
      genre,
      force_ch_link_check: "",
      fav: "0",
      sortby: "number",
      hd: "0",
      p: "1"
    }, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/create-link", async (req, res) => {
  try {
    await ensureAuth();
    const cmd = req.query.cmd || "";
    if (!cmd) return res.json({ ok: false, error: "Missing cmd" });

    const raw = await stalkerRequest({ 
      type: req.query.type === "vod" ? "vod" : "itv", 
      action: "create_link", 
      cmd,
      series: "0",
      forced_storage: "0",
      disable_ad: "0",
      download: "0"
    }, true);

    const playUrl = extractUrl(raw);
    res.json({ ok: !!playUrl, url: playUrl });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/media-library", async (req, res) => {
  try {
    await ensureAuth();
    const raw = await stalkerRequest({ type: "vod", action: "get_categories" }, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/vod-list", async (req, res) => {
  try {
    await ensureAuth();
    const { category = "*", movie_id, season_id } = req.query;
    const params = { type: "vod", action: "get_ordered_list", category, p: "1", num: "1000" };
    if (movie_id) params.movie_id = movie_id;
    if (season_id) params.season_id = season_id;
    const raw = await stalkerRequest(params, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/radio", async (req, res) => {
  try {
    await ensureAuth();
    const raw = await stalkerRequest({ type: "radio", action: "get_categories" }, true);
    res.json({ ok: true, data: normalizeArray(raw) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/search", async (req, res) => {
  try {
    await ensureAuth();
    const q = req.query.q || "";
    const [live, vod] = await Promise.all([
      stalkerRequest({ type: "itv", action: "get_ordered_list", search: q }, true),
      stalkerRequest({ type: "vod", action: "get_ordered_list", search: q }, true)
    ]);
    res.json({ ok: true, data: [...normalizeArray(live), ...normalizeArray(vod)] });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => console.log(`Backend on ${PORT}`));
module.exports = app;