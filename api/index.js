const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

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
  }
];

let currentIdx = 0;
let token = "";
let randomValue = "";

// Robust User-Agent to match OTT Navigator/MAG250
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
    "Accept-Charset": "UTF-8,*;q=0.8",
    "Connection": "Keep-Alive",
  };
  if (useAuth && token) headers["Authorization"] = `Bearer ${token}`;
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
    
    // Log non-JSON or weird responses
    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed.startsWith("<")) {
          console.error(`[Portal] ${p().name} returned HTML instead of JSON. Possible block or wrong URL.`);
          return { error: "HTML_RESPONSE", raw: trimmed.substring(0, 200) };
      }
      try {
        data = JSON.parse(trimmed);
      } catch (e) {
        console.warn(`[Portal] ${p().name} non-JSON response:`, trimmed.substring(0, 100));
        data = { raw_text: trimmed };
      }
    }
    return data;
  } catch (err) {
    console.error(`[Portal] Request Error (${action}):`, err.message);
    throw err;
  }
}

async function doHandshake() {
  console.log(`[Auth] ${p().name} Handshake Init...`);
  const data = await stalkerRequest({ 
    type: "stb", 
    action: "handshake", 
    token: "", 
    JsHttpRequest: "1-xml" 
  });
  
  console.log(`[Auth] ${p().name} Handshake Response:`, JSON.stringify(data));

  // Extract token from various possible locations (js.token, token, results.token)
  token = data?.js?.token || data?.token || data?.results?.token || "";
  randomValue = data?.js?.random || data?.random || data?.results?.random || "";
  
  if (!token) {
    console.error(`[Auth] ${p().name} Handshake Failed: No token found in response.`);
    throw new Error("Handshake failed");
  }
  
  console.log(`[Auth] ${p().name} Handshake Success. Token: ${token.substring(0, 8)}...`);
  return data;
}

async function getProfile() {
  if (!token) await doHandshake();
  const profile = await stalkerRequest({
    type: "stb",
    action: "get_profile",
    hd: "1",
    ver: "ImageDescription: 0.2.18-r22-pub-270; PORTAL version: 5.6.1;",
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
  
  console.log(`[Auth] ${p().name} Profile:`, JSON.stringify(profile));
  return profile;
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
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function extractUrl(data, originalCmd = "") {
  const js = data?.js || {};
  let cmd = js.cmd || js.url || js.stream_url || js.ffmpeg_cmd || data.cmd || data.url || "";
  if (typeof data?.js === "string") cmd = data.js;
  
  let finalUrl = String(cmd).trim().replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim();

  if (finalUrl.startsWith("?token=")) {
      let base = String(originalCmd).replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim();
      if (base.startsWith("http")) {
          const sep = base.includes("?") ? "&" : "?";
          return base + sep + finalUrl.substring(1);
      }
      if (js.stream_url && js.stream_url.includes("://")) {
          return js.stream_url.split('?')[0] + finalUrl;
      }
  }
  return finalUrl;
}

// Routes
app.get("/", (req, res) => res.send(`POOMANI TV Active: ${p().name}`));
app.get("/health", (req, res) => res.json({ status: "ok", active: p().name }));

app.get("/api/connect", async (req, res) => {
  try {
    const profile = await ensureAuth();
    res.json({ ok: true, token, profile, provider: p().name });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/providers", (req, res) => {
  const list = PROVIDERS.map((pr, i) => ({ ...pr, active: i === currentIdx }));
  res.json({ ok: true, providers: list });
});

app.post("/api/select-provider", (req, res) => {
  const { id } = req.body;
  const idx = PROVIDERS.findIndex(pr => pr.id === id);
  if (idx === -1) return res.json({ ok: false, error: "Provider not found" });
  currentIdx = idx;
  token = "";
  res.json({ ok: true, active: p().name });
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
    const data = await stalkerRequest({ type: "itv", action: "get_ordered_list", genre, JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/vod-list", async (req, res) => {
  try {
    await ensureAuth();
    const { category = "*", movie_id, season_id } = req.query;
    const params = { type: "vod", action: "get_ordered_list", category, p: "1", num: "1000", JsHttpRequest: "1-xml" };
    if (movie_id) params.movie_id = movie_id;
    if (season_id) params.season_id = season_id;
    const data = await stalkerRequest(params, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/series-info", async (req, res) => {
  try {
    await ensureAuth();
    const movie_id = req.query.id;
    const data = await stalkerRequest({ type: "vod", action: "get_info", movie_id, JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/create-link", async (req, res) => {
  try {
    await ensureAuth();
    const { cmd = "", type = "itv", series = "0", movie_id, season_id, episode_id } = req.query;
    const params = { type, action: "create_link", cmd, series, JsHttpRequest: "1-xml" };
    if (movie_id) params.movie_id = movie_id;
    if (season_id) params.season_id = season_id;
    if (episode_id) params.episode_id = episode_id;
    const data = await stalkerRequest(params, true);
    const playUrl = extractUrl(data, cmd);
    res.json({ ok: !!playUrl, url: playUrl, raw: data });
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

app.listen(PORT, "0.0.0.0", () => console.log(`Server on ${PORT}`));
module.exports = app;