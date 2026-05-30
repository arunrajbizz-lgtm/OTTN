const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

app.use(cors({ origin: "*" }));
app.use(express.json());

// Credentials from "Working Code"
const PORTAL = "http://play.tatasky.xyz/stalker_portal";
const MAC = "00:1A:79:07:B2:B8";
const SN = "BAFDBC492E3DD";

const DEVICE_ID = "E13DBFB1CC4977AE6A6202606271DF6B801D2A7779AE301A732B86C98AC4E642";
const DEVICE_ID2 = "E13DBFB1CC4977AE6A6202606271DF6B801D2A7779AE301A732B86C98AC4E642";
const SIGNATURE = "";
const HW_VERSION_2 = DEVICE_ID.toLowerCase();

const USER_AGENT = "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 2 rev: 250 Safari/533.3";

let token = "";
let randomValue = "";

function getHeaders(useAuth = false) {
  const headers = {
    "User-Agent": USER_AGENT,
    "X-User-Agent": "Model: MAG250; Link: WiFi",
    Referer: `${PORTAL}/c/`,
    Origin: PORTAL,
    Cookie: `mac=${MAC}; stb_lang=en; timezone=Asia/Kolkata`,
    Accept: "*/*",
    Connection: "Keep-Alive",
  };
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function stalkerRequest(params, useAuth = false) {
  console.log(`[Portal] Requesting: ${params.action || params.type}`);
  try {
    const res = await axios.get(`${PORTAL}/server/load.php`, {
      params,
      headers: getHeaders(useAuth),
      timeout: 30000,
      validateStatus: () => true,
    });
    return res.data;
  } catch (err) {
    console.error(`[Portal] Request Error:`, err.message);
    throw err;
  }
}

async function doHandshake() {
  const data = await stalkerRequest({ type: "stb", action: "handshake", token: "", JsHttpRequest: "1-xml" });
  token = data?.js?.token || "";
  randomValue = data?.js?.random || "";
  if (!token) throw new Error("Handshake failed");
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
    sn: SN,
    stb_type: "MAG250",
    image_version: "218",
    video_out: "hdmi",
    device_id: DEVICE_ID,
    device_id2: DEVICE_ID2,
    signature: SIGNATURE,
    auth_second_step: "1",
    hw_version: "1.7-BD-00",
    not_valid_token: "0",
    client_type: "STB",
    hw_version_2: HW_VERSION_2,
    timestamp: Math.floor(Date.now() / 1000),
    api_signature: "263",
    metrics: JSON.stringify({ mac: MAC, sn: SN, model: "MAG250", type: "STB", uid: DEVICE_ID, random: randomValue }),
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
  let cmd = data?.js?.cmd || data?.js?.data?.cmd || data?.cmd || data?.data?.cmd || "";
  cmd = String(cmd).trim();
  cmd = cmd.replace(/^ffmpeg\s+/i, "").trim();
  return cmd;
}

// Routes
app.get("/", (req, res) => res.send("POOMANI TV Backend Live (Airtel4K)"));
app.get("/health", (req, res) => res.json({ status: "ok", portal: "reachable" }));

app.get(["/api/connect", "/connect"], async (req, res) => {
  try {
    const profile = await ensureAuth();
    res.json({ ok: true, token, profile });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/live-categories", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "itv", action: "get_genres", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data), raw: data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/live-channels", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const data = await stalkerRequest({
      type: "itv", action: "get_ordered_list", genre, force_ch_link_check: "",
      fav: "0", sortby: "number", hd: "0", p: "1", JsHttpRequest: "1-xml"
    }, true);
    res.json({ ok: true, data: normalizeArray(data), raw: data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/create-link", async (req, res) => {
  try {
    await ensureAuth();
    const cmd = req.query.cmd || "";
    if (!cmd) return res.json({ ok: false, error: "Missing cmd" });
    const data = await stalkerRequest({
      type: "itv", action: "create_link", cmd, series: "0",
      forced_storage: "0", disable_ad: "0", download: "0", JsHttpRequest: "1-xml"
    }, true);
    const playUrl = extractUrl(data);
    res.json({ ok: !!playUrl, url: playUrl, raw: data, error: playUrl ? "" : "No play URL returned" });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/media-library", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "vod", action: "get_categories", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data), raw: data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/vod-list", async (req, res) => {
  try {
    await ensureAuth();
    const category = req.query.category || "*";
    const data = await stalkerRequest({
      type: "vod", action: "get_ordered_list", category, fav: "0", sortby: "added", JsHttpRequest: "1-xml"
    }, true);
    res.json({ ok: true, data: normalizeArray(data), raw: data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/radio", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "radio", action: "get_categories", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: normalizeArray(data), raw: data });
  } catch (err) { res.json({ ok: false, error: err.message }); }
});

app.get("/api/tmdb/search", async (req, res) => {
  try {
    const title = req.query.title;
    if (!title || !TMDB_API_KEY) return res.json({ ok: false, error: "Missing title or key" });
    const response = await axios.get("https://api.themoviedb.org/3/search/movie", { params: { api_key: TMDB_API_KEY, query: title } });
    const movie = response.data.results?.[0];
    if (!movie) return res.json({ ok: false, error: "Not found" });
    res.json({ ok: true, title: movie.title, overview: movie.overview, rating: movie.vote_average, poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "" });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});

module.exports = app;