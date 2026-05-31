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
  try {
    const res = await axios.get(`${p().portal}/server/load.php`, {
      params,
      headers: getHeaders(useAuth),
      timeout: 30000,
      validateStatus: () => true,
    });
    let data = res.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data.trim()); } catch (e) { data = { raw_text: data }; }
    }
    return data;
  } catch (err) {
    console.error(`[Portal] Error:`, err.message);
    throw err;
  }
}

async function doHandshake() {
  const handshakeParams = { type: "stb", action: "handshake", token: "", mac: p().mac, stb_type: "MAG250", JsHttpRequest: "1-xml" };
  let data = await stalkerRequest(handshakeParams);
  if (!data || data.js === false || !data.js?.token) data = await stalkerRequest({ type: "stb", action: "handshake", token: "" });
  token = data?.js?.token || data?.token || data?.results?.token || "";
  randomValue = data?.js?.random || data?.random || data?.results?.random || "";
  if (!token) throw new Error("Handshake failed");
  return data;
}

async function getProfile() {
  if (!token) await doHandshake();
  return await stalkerRequest({
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

// PRODUCTION SERIES LOGIC
app.get("/api/series-info", async (req, res) => {
  try {
    await ensureAuth();
    const movie_id = req.query.id;
    
    // STEP 1: Get Seasons
    const seasonData = await stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id, JsHttpRequest: "1-xml" }, true);
    const rawSeasons = normalizeArray(seasonData);
    
    const seasons = [];
    for (const s of rawSeasons) {
      if (!s.id || !s.is_season) continue;
      
      // STEP 2: Get Episodes for this Season
      const epData = await stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id, season_id: s.id, JsHttpRequest: "1-xml" }, true);
      const rawEpisodes = normalizeArray(epData);
      
      seasons.push({
        id: s.id,
        seasonNumber: parseInt(s.season_number || s.number || 1),
        episodes: rawEpisodes.map(e => ({
          id: e.id,
          episodeNumber: parseInt(e.series_number || e.number || 0),
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
    
    // 1. Get exact episode metadata to obtain the 'cmd'
    const epData = await stalkerRequest({ 
      type: "vod", 
      action: "get_ordered_list", 
      movie_id: series_id, 
      season_id: season_id, 
      episode_id: episode_id,
      JsHttpRequest: "1-xml" 
    }, true);
    
    const episodes = normalizeArray(epData);
    const episode = episodes[0]; // Portal returns the single requested episode in an array
    
    if (!episode || !episode.cmd) {
        console.error("EPISODE_CMD_DISCOVERY_FAILED", JSON.stringify(epData));
        throw new Error("Episode command not found in portal response");
    }

    // 2. Call create_link with the discovered cmd and series="2"
    const params = {
      type: "vod",
      action: "create_link",
      cmd: episode.cmd,
      series: "2",
      movie_id: series_id,
      season_id: season_id,
      episode_id: episode_id,
      JsHttpRequest: "1-xml"
    };

    const data = await stalkerRequest(params, true);
    const js = data?.js || {};
    let url = js.cmd || js.url || data.cmd || data.url || "";
    
    res.json({ 
      ok: !!url, 
      url: String(url).replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim() 
    });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

// Routes
app.get("/api/connect", async (req, res) => {
  try { await ensureAuth(); res.json({ ok: true, token, provider: p().name }); } 
  catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/live-categories", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "itv", action: "get_genres", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/media-library", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "vod", action: "get_categories", JsHttpRequest: "1-xml" }, true);
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

app.get("/api/create-link", async (req, res) => {
  try {
    await ensureAuth();
    const { cmd = "", type = "itv" } = req.query;
    const data = await stalkerRequest({ type, action: "create_link", cmd, JsHttpRequest: "1-xml" }, true);
    const js = data?.js || {};
    let url = js.cmd || js.url || data.cmd || data.url || "";
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

app.get("/api/episode-debug", async (req, res) => {
  try {
    await ensureAuth();
    const { series_id, season_id, episode_id } = req.query;
    
    const [test1, test2, test3, test4, test5] = await Promise.all([
      stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id: series_id, season_id: season_id, episode_id: episode_id, JsHttpRequest: "1-xml" }, true),
      stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id: series_id, season_id: season_id, JsHttpRequest: "1-xml" }, true),
      stalkerRequest({ type: "vod", action: "get_info", movie_id: episode_id, JsHttpRequest: "1-xml" }, true),
      stalkerRequest({ type: "vod", action: "create_link", cmd: `/media/${episode_id}.mpg`, series: "2", JsHttpRequest: "1-xml" }, true),
      stalkerRequest({ type: "vod", action: "create_link", cmd: `/media/${series_id}.mpg`, series: "2", JsHttpRequest: "1-xml" }, true)
    ]);

    res.json({ ok: true, test1, test2, test3, test4, test5 });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server on ${PORT}`));
module.exports = app;