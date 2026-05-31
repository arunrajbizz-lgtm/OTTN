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
      if (trimmed.startsWith("<")) throw new Error("Portal returned HTML");
      try { data = JSON.parse(trimmed); } catch (e) { data = { raw_text: trimmed }; }
    }
    return data;
  } catch (err) {
    console.error(`[Portal] ${p().name} Error (${action}):`, err.message);
    throw err;
  }
}

async function doHandshake() {
  const data = await stalkerRequest({ type: "stb", action: "handshake", token: "", JsHttpRequest: "1-xml" });
  token = data?.js?.token || data?.token || "";
  randomValue = data?.js?.random || data?.random || "";
  if (!token) throw new Error("Handshake failed");
  return data;
}

async function getProfile() {
  if (!token) await doHandshake();
  return await stalkerRequest({
    type: "stb",
    action: "get_profile",
    hd: "1",
    ver: "ImageDescription: 0.2.18-r22-pub-270; PORTAL version: 5.6.1;",
    sn: p().sn,
    stb_type: "MAG250",
    device_id: p().deviceId,
    device_id2: p().deviceId2,
    signature: p().signature,
    timestamp: Math.floor(Date.now() / 1000),
    metrics: JSON.stringify({ mac: p().mac, sn: p().sn, model: "MAG250", type: "STB", uid: p().deviceId, random: randomValue }),
    JsHttpRequest: "1-xml",
  }, true);
}

async function ensureAuth() {
  token = "";
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
  const js = data?.js || {};
  let cmd = js.cmd || js.url || js.stream_url || js.ffmpeg_cmd || data.cmd || data.url || data.results || "";
  
  if (typeof data?.js === "string" && data.js.startsWith("http")) cmd = data.js;
  
  let finalUrl = String(cmd).trim().replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim();

  // Handle case where portal returns only a token suffix
  if (finalUrl.startsWith("?token=") && (js.stream_url || js.url)) {
      const base = (js.stream_url || js.url).split('?')[0];
      finalUrl = base + finalUrl;
  }

  return finalUrl;
}

// SERIES PARSER
function discoverEpisodes(obj, episodes = []) {
  if (!obj || typeof obj !== "object") return episodes;
  if (obj.cmd && (obj.name || obj.title)) {
    episodes.push({
      id: obj.id || obj.movie_id || Math.random().toString(36).substr(2, 9),
      title: obj.name || obj.title,
      season: parseInt(obj.season_number || obj.season || obj.s_num || 1),
      episode: parseInt(obj.episode_number || obj.episode || obj.number || obj.e_num || 0),
      cmd: obj.cmd
    });
  }
  for (let key in obj) {
    if (obj[key] && typeof obj[key] === "object") discoverEpisodes(obj[key], episodes);
  }
  return episodes;
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
    const data = await stalkerRequest({ type: "itv", action: "get_ordered_list", genre, force_ch_link_check: "0", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/vod-list", async (req, res) => {
  try {
    await ensureAuth();
    const category = req.query.category || "*";
    const data = await stalkerRequest({ type: "vod", action: "get_ordered_list", category, p: "1", num: "1000", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/series-info", async (req, res) => {
  try {
    await ensureAuth();
    const movie_id = req.query.id;
    const raw = await stalkerRequest({ type: "vod", action: "get_info", movie_id, JsHttpRequest: "1-xml" }, true);
    console.log("SERIES RAW", JSON.stringify(raw, null, 2));
    
    const js = raw?.js || raw;
    const allEpisodes = discoverEpisodes(js);
    const seasonsMap = {};
    
    allEpisodes.forEach(ep => {
      if (!seasonsMap[ep.season]) seasonsMap[ep.season] = [];
      seasonsMap[ep.season].push(ep);
    });

    const seasons = Object.keys(seasonsMap).sort((a,b) => a-b).map(sNum => ({
      seasonNumber: parseInt(sNum),
      episodes: seasonsMap[sNum].sort((a,b) => a.episode - b.episode)
    }));

    console.log("SEASONS", JSON.stringify(seasons, null, 2));
    res.json({
      ok: true,
      data: {
        id: js.id || movie_id,
        title: js.name || js.title,
        plot: js.description || js.info || "",
        poster: js.screenshot || js.poster || "",
        seasons
      }
    });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/create-link", async (req, res) => {
  try {
    await ensureAuth();
    const cmd = req.query.cmd || "";
    const type = req.query.type || "itv";
    const data = await stalkerRequest({ type, action: "create_link", cmd, JsHttpRequest: "1-xml" }, true);
    
    console.log("CREATE LINK RAW", JSON.stringify(data, null, 2));

    const playUrl = extractUrl(data);
    
    if (!playUrl || playUrl.startsWith("?")) {
        console.error("INVALID PLAY URL EXTRACTED:", playUrl);
        return res.json({ ok: false, url: "", error: "Invalid link format from portal" });
    }

    res.json({ ok: true, url: playUrl });
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