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

const USER_AGENT = "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 2 rev: 250 Safari/533.3";

function p() { return PROVIDERS[currentIdx]; }

function getHeaders(useAuth = false) {
  const headers = {
    "User-Agent": USER_AGENT,
    "Referer": `${p().portal}/c/index.html`,
    "Cookie": `mac=${p().mac}; stb_lang=en; timezone=Asia/Kolkata`,
    "Accept": "*/*",
    "Connection": "Keep-Alive",
  };
  if (useAuth && token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function stalkerRequest(params, useAuth = false, customHeaders = null) {
  const action = params.action || params.type;
  try {
    const url = `${p().portal}/server/load.php`;
    const headers = customHeaders || getHeaders(useAuth);
    
    // DEBUG: Log the full request details
    console.log(`[Request] ${url}?${new URLSearchParams(params).toString()}`);
    // console.log(`[Headers]`, JSON.stringify(headers));

    const res = await axios.get(url, {
      params,
      headers,
      timeout: 15000,
      validateStatus: () => true,
    });

    let data = res.data;
    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed.startsWith("<")) return { error: "HTML_RESPONSE", raw: trimmed.substring(0, 100) };
      try { data = JSON.parse(trimmed); } catch (e) { data = { raw_text: trimmed }; }
    }
    return data;
  } catch (err) {
    console.error(`[Axios] Error:`, err.message);
    throw err;
  }
}

async function doHandshake() {
  console.log(`[Auth] Handshake Start for ${p().name}...`);
  
  // Strategy 1: Standard Stalker Handshake
  let data = await stalkerRequest({ 
    type: "stb", 
    action: "handshake", 
    token: "", 
    JsHttpRequest: "1-xml" 
  });
  
  // Strategy 2: Fallback to plain handshake if failed
  if (!data || data.js === false || data.error) {
      console.warn(`[Auth] Strategy 1 failed, trying fallback...`);
      data = await stalkerRequest({ 
        type: "stb", 
        action: "handshake"
      });
  }

  console.log(`[Auth] Response:`, JSON.stringify(data));

  token = data?.js?.token || data?.token || data?.results?.token || "";
  randomValue = data?.js?.random || data?.random || data?.results?.random || "";
  
  if (!token) throw new Error("Handshake failed");
  
  console.log(`[Auth] Token OK: ${token.substring(0, 6)}...`);
  return data;
}

async function getProfile() {
  if (!token) await doHandshake();
  return await stalkerRequest({
    type: "stb",
    action: "get_profile",
    hd: "1",
    ver: "ImageDescription: 0.2.18-r22-pub-270;",
    sn: p().sn,
    stb_type: "MAG250",
    device_id: p().deviceId,
    device_id2: p().deviceId2,
    signature: p().signature,
    auth_second_step: "1",
    hw_version: "1.7-BD-00",
    not_valid_token: "0",
    client_type: "STB",
    hw_version_2: p().deviceId.toLowerCase(),
    timestamp: Math.floor(Date.now() / 1000),
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

// Routes
app.get("/", (req, res) => res.send(`POOMANI TV Active: ${p().name}`));
app.get("/health", (req, res) => res.json({ status: "ok", active: p().name }));

app.get("/api/connect", async (req, res) => {
  try {
    const profile = await ensureAuth();
    res.json({ ok: true, token, profile, provider: p().name });
  } catch (err) { 
    res.json({ ok: false, error: err.message, portal: p().portal }); 
  }
});

app.get("/api/handshake-debug", async (req, res) => {
  const { portal, mac } = req.query;
  if (!portal || !mac) return res.json({ error: "Missing portal or mac" });
  
  try {
    const headers = {
        "User-Agent": USER_AGENT,
        "Referer": `${portal}/c/`,
        "Cookie": `mac=${mac}; stb_lang=en; timezone=Asia/Kolkata`,
        "Accept": "*/*"
    };
    const url = `${portal}/server/load.php`;
    const r = await axios.get(url, {
        params: { type: "stb", action: "handshake", token: "", JsHttpRequest: "1-xml" },
        headers
    });
    res.json({ ok: true, response: r.data, sent_headers: headers });
  } catch (e) { res.json({ ok: false, error: e.message }); }
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
    const id = req.query.id;
    const data = await stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id: id, JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, raw: data });
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
    
    const js = data?.js || {};
    let rawCmd = js.cmd || js.url || data.cmd || data.url || "";
    if (typeof data?.js === "string") rawCmd = data.js;
    
    let playUrl = String(rawCmd).trim().replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim();
    
    // Token resolution fallback
    if (playUrl.startsWith("?token=")) {
        if (js.stream_url) playUrl = js.stream_url.split('?')[0] + playUrl;
        else if (cmd.startsWith("http")) playUrl = cmd.split('?')[0] + playUrl;
    }

    res.json({ ok: !!playUrl, url: playUrl, raw: data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/series-debug", async (req, res) => {
  try {
    await ensureAuth();
    const id = req.query.id;
    
    const [test1, test2, test3, test4, test5] = await Promise.all([
      stalkerRequest({ type: "vod", action: "get_info", movie_id: id, JsHttpRequest: "1-xml" }, true),
      stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id: id, JsHttpRequest: "1-xml" }, true),
      stalkerRequest({ type: "vod", action: "get_ordered_list", category: id, JsHttpRequest: "1-xml" }, true),
      stalkerRequest({ type: "vod", action: "get_info", movie_id: id, season_id: "0", JsHttpRequest: "1-xml" }, true),
      stalkerRequest({ type: "vod", action: "create_link", cmd: `/media/${id}.mpg`, JsHttpRequest: "1-xml" }, true)
    ]);

    res.json({ 
      ok: true, 
      test1, 
      test2, 
      test3, 
      test4, 
      test5 
    });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server on ${PORT}`));
module.exports = app;