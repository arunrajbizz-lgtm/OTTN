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

let currentIdx = 1; // Default to TataSky
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
  const data = await stalkerRequest({ type: "stb", action: "handshake", token: "", JsHttpRequest: "1-xml" });
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

// Routes
app.get("/api/connect", async (req, res) => {
  try { await ensureAuth(); res.json({ ok: true, token, provider: p().name }); } 
  catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/vod-list", async (req, res) => {
  try {
    await ensureAuth();
    const { category = "*", movie_id, season_id } = req.query;
    const params = { type: "vod", action: "get_ordered_list", category, JsHttpRequest: "1-xml" };
    if (movie_id) params.movie_id = movie_id;
    if (season_id) params.season_id = season_id;
    const data = await stalkerRequest(params, true);
    res.json({ ok: true, data: normalizeArray(data) });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/series-debug", async (req, res) => {
  try {
    await ensureAuth();
    const id = req.query.id;
    const results = {};

    // 1. movie_id only
    results.movie_id_only = await stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id: id, JsHttpRequest: "1-xml" }, true);
    console.log("SERIES DEBUG (movie_id_only)", JSON.stringify(results.movie_id_only, null, 2));

    // 2. category only (trying to see if ID works as category)
    results.category_only = await stalkerRequest({ type: "vod", action: "get_ordered_list", category: id, JsHttpRequest: "1-xml" }, true);
    console.log("SERIES DEBUG (category_only)", JSON.stringify(results.category_only, null, 2));

    // 3. movie_id + season_id=0
    results.movie_plus_season0 = await stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id: id, season_id: "0", JsHttpRequest: "1-xml" }, true);
    console.log("SERIES DEBUG (movie_plus_season0)", JSON.stringify(results.movie_plus_season0, null, 2));

    // 4. movie_id + episode_id=0
    results.movie_plus_episode0 = await stalkerRequest({ type: "vod", action: "get_ordered_list", movie_id: id, episode_id: "0", JsHttpRequest: "1-xml" }, true);
    console.log("SERIES DEBUG (movie_plus_episode0)", JSON.stringify(results.movie_plus_episode0, null, 2));

    res.json({ ok: true, results });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/create-link", async (req, res) => {
  try {
    await ensureAuth();
    const { cmd, movie_id, season_id, episode_id } = req.query;
    const params = { type: "vod", action: "create_link", cmd, series: "2", JsHttpRequest: "1-xml" };
    if (movie_id) params.movie_id = movie_id;
    if (season_id) params.season_id = season_id;
    if (episode_id) params.episode_id = episode_id;
    
    console.log("CREATE_LINK_PARAMS", params);
    const data = await stalkerRequest(params, true);
    console.log("CREATE_LINK_RESPONSE", JSON.stringify(data, null, 2));

    const js = data?.js || {};
    let url = js.cmd || js.url || data.cmd || data.url || "";
    res.json({ ok: !!url, url: String(url).replace(/^(ffmpeg|ffrt|mpv|auto)\s+/i, "").trim(), raw: data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server on ${PORT}`));
module.exports = app;