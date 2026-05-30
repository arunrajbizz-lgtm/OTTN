const express = require("express");
const cors = require("cors");
const axios = require("axios");
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

const PORTAL = "http://tatatv.cc/stalker_portal";
const MAC = "00:1A:79:00:2B:A7";

const SN = "A44FE126E0250";
const DEVICE_ID = "AEE189124634425D24481DEDFBFF7C73F6EB2B89163EE3144B5EB85144812EB8";
const DEVICE_ID2 = "AEE189124634425D24481DEDFBFF7C73F6EB2B89163EE3144B5EB85144812EB8";
const SIGNATURE = "";
const HW_VERSION_2 = DEVICE_ID.toLowerCase();

const USER_AGENT =
  "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG250 stbapp ver: 2 rev: 250 Safari/533.3";

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
    "Cache-Control": "no-cache",
  };
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function stalkerRequest(params, useAuth = false) {
  const res = await axios.get(`${PORTAL}/server/load.php`, {
    params,
    headers: getHeaders(useAuth),
    timeout: 25000,
    validateStatus: () => true,
  });

  if (typeof res.data === "string") {
    const t = res.data.trim();
    if (t.startsWith("<")) throw new Error("Portal returned HTML");
    try { return JSON.parse(t); } catch { return { raw_text: t }; }
  }
  return res.data;
}

function listFrom(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  const js = raw.js ?? raw.data ?? raw.results ?? raw;

  if (Array.isArray(js)) return js;
  if (Array.isArray(js.data)) return js.data;
  if (Array.isArray(js.results)) return js.results;
  if (Array.isArray(js.channels)) return js.channels;
  if (Array.isArray(js.genres)) return js.genres;
  if (Array.isArray(js.movies)) return js.movies;

  if (js && typeof js === "object") {
    for (const k of ["data", "results", "channels", "genres", "movies"]) {
      if (js[k] && typeof js[k] === "object") {
        const v = Object.values(js[k]).filter(x => x && typeof x === "object");
        if (v.length) return v;
      }
    }
    const vals = Object.values(js).filter(x => x && typeof x === "object");
    if (vals.length) return vals;
  }
  return [];
}

async function doHandshake() {
  const data = await stalkerRequest({
    type: "stb",
    action: "handshake",
    token: "",
    JsHttpRequest: "1-xml",
  });

  token = data?.js?.token || "";
  randomValue = data?.js?.random || "";

  if (!token) throw new Error("Handshake failed");
  return data;
}

async function getProfile() {
  if (!token) await doHandshake();

  return await stalkerRequest(
    {
      type: "stb",
      action: "get_profile",
      hd: "1",
      ver:
        "ImageDescription: 0.2.18-r22-pub-270; ImageDate: Tue Dec 19 11:33:53 EET 2017; PORTAL version: 5.6.1; API Version: JS API version: 328; STB API version: 134; Player Engine version: 0x566",
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
      metrics: JSON.stringify({
        mac: MAC,
        sn: SN,
        model: "MAG250",
        type: "STB",
        uid: DEVICE_ID,
        random: randomValue,
      }),
      JsHttpRequest: "1-xml",
    },
    true
  );
}

function authFailed(data) {
  const msg = String(data?.js?.msg || data?.js?.error || data?.error || "").toLowerCase();
  if (!data) return true;
  if (typeof data === "string") return true;
  if (msg.includes("authorization failed")) return true;
  if (data?.js?.status === 2) return true;
  if (data?.js?.block_msg) return true;
  return false;
}

async function ensureAuth() {
  await doHandshake();
  const profile = await getProfile();
  if (authFailed(profile)) throw new Error(profile?.js?.msg || profile?.js?.error || "Authorization failed");
  return profile;
}


async function getAllPages(baseParams, maxPages = 20) {
  let all = [];
  let lastRaw = null;
  for (let p = 1; p <= maxPages; p++) {
    const data = await stalkerRequest({ ...baseParams, p: String(p), JsHttpRequest: "1-xml" }, true);
    lastRaw = data;
    const arr = listFrom(data);
    if (!arr.length) break;
    all = all.concat(arr);
    const total = Number(data?.js?.total_items || data?.js?.total || data?.total_items || 0);
    if (total && all.length >= total) break;
    if (arr.length < 14 && p > 1) break;
  }
  return { all, raw: lastRaw };
}

function cleanUrl(u) {
  return String(u || "").replace(/^ffmpeg\s+/i, "").replace(/^ffrt\s+/i, "").trim();
}


async function firstWorking(calls) {
  let last = null;
  for (const c of calls) {
    try {
      const data = await stalkerRequest({ ...c.params, JsHttpRequest: "1-xml" }, true);
      const arr = listFrom(data);
      last = data;
      if (arr.length || data?.js?.total_items || data?.js?.data) return { data, arr, used: c.name };
    } catch (e) {
      last = { error: e.message };
    }
  }
  return { data: last, arr: [], used: "none" };
}

async function pagedFallback(calls, maxPages = 50) {
  for (const c of calls) {
    let all = [], raw = null;
    try {
      for (let p = 1; p <= maxPages; p++) {
        const data = await stalkerRequest({ ...c.params, p: String(p), JsHttpRequest: "1-xml" }, true);
        raw = data;
        const arr = listFrom(data);
        if (!arr.length) break;
        all = all.concat(arr);
        const total = Number(data?.js?.total_items || data?.js?.total || data?.total_items || 0);
        if (total && all.length >= total) break;
        if (arr.length < 14 && p > 1) break;
      }
      if (all.length) return { all, raw, used: c.name };
    } catch(e) { raw = { error: e.message }; }
  }
  return { all: [], raw: null, used: "none" };
}

app.get("/api/connect", async (req, res) => {
  try {
    const profile = await ensureAuth();
    res.json({ ok: true, token, profile });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});
app.post("/api/connect", async (req, res) => {
  try {
    const profile = await ensureAuth();
    res.json({ ok: true, token, profile });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get("/api/live-categories", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({ type: "itv", action: "get_genres", JsHttpRequest: "1-xml" }, true);
    res.json({ ok: true, data: listFrom(data), raw: data });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/live-channels", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const { all, raw } = await getAllPages({
      type: "itv", action: "get_ordered_list", genre, fav: "0", sortby: "number"
    }, 50);
    res.json({ ok: true, data: all, raw });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/archive-categories", async (req, res) => {
  try {
    await ensureAuth();
    const { all, raw } = await getAllPages({
      type: "itv", action: "get_ordered_list", genre: "*", fav: "0", sortby: "number"
    }, 50);
    const archive = all.filter(x =>
      String(x.archive || x.enable_tv_archive || x.use_archive || "") === "1" ||
      Number(x.tv_archive_duration || x.allow_pvr || 0) > 0
    );
    res.json({ ok: true, data: archive, raw });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/media-library", async (req, res) => {
  try {
    await ensureAuth();
    const r = await firstWorking([
      { name:"vod/get_categories", params:{ type:"vod", action:"get_categories" } },
      { name:"vod/get_genres", params:{ type:"vod", action:"get_genres" } },
      { name:"video/get_categories", params:{ type:"video", action:"get_categories" } },
      { name:"video/get_genres", params:{ type:"video", action:"get_genres" } }
    ]);
    res.json({ ok: true, data: r.arr, raw: r.data, used: r.used });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/vod-list", async (req, res) => {
  try {
    await ensureAuth();
    const category = req.query.category || req.query.category_id || "*";
    const r = await pagedFallback([
      { name:"vod/category", params:{ type:"vod", action:"get_ordered_list", category, fav:"0", sortby:"added" } },
      { name:"vod/genre", params:{ type:"vod", action:"get_ordered_list", genre:category, fav:"0", sortby:"added" } },
      { name:"video/category", params:{ type:"video", action:"get_ordered_list", category, fav:"0", sortby:"added" } },
      { name:"video/genre", params:{ type:"video", action:"get_ordered_list", genre:category, fav:"0", sortby:"added" } }
    ], 50);
    const filtered = category === "*" ? r.all : r.all.filter(x => {
      const vals = [
        x.category_id, x.category, x.genre_id, x.genre, x.cat_id,
        x.category_name, x.genre_title, x.tv_genre_name
      ].map(v => String(v || "").toLowerCase());
      return vals.includes(String(category).toLowerCase());
    });
    res.json({ ok: true, data: filtered.length ? filtered : r.all, raw: r.raw, used: r.used, category });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/radio", async (req, res) => {
  try {
    await ensureAuth();
    const r = await firstWorking([
      { name:"radio/get_genres", params:{ type:"radio", action:"get_genres" } },
      { name:"radio/get_categories", params:{ type:"radio", action:"get_categories" } }
    ]);
    res.json({ ok: true, data: r.arr, raw: r.data, used: r.used });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/radio-list", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const r = await pagedFallback([
      { name:"radio/genre", params:{ type:"radio", action:"get_ordered_list", genre, fav:"0", sortby:"number" } },
      { name:"radio/category", params:{ type:"radio", action:"get_ordered_list", category:genre, fav:"0", sortby:"number" } }
    ], 50);
    res.json({ ok: true, data: r.all, raw: r.raw, used: r.used });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});


app.get("/api/archive-list", async (req, res) => {
  try {
    await ensureAuth();
    const genre = req.query.genre || "*";
    const r = await pagedFallback([
      { name:"itv/genre/archive", params:{ type:"itv", action:"get_ordered_list", genre, fav:"0", sortby:"number", only_archive:"1" } },
      { name:"itv/genre", params:{ type:"itv", action:"get_ordered_list", genre, fav:"0", sortby:"number" } }
    ], 50);
    const archive = r.all.filter(x => String(x.archive || x.enable_tv_archive || x.use_archive || "") === "1" || Number(x.tv_archive_duration || x.allow_pvr || 0) > 0);
    res.json({ ok: true, data: archive.length ? archive : r.all, raw: r.raw, used: r.used });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/create-link", async (req, res) => {
  try {
    await ensureAuth();
    const type = req.query.type || "itv";
    const cmd = req.query.cmd || "";
    if (!cmd) return res.json({ ok: false, error: "Missing cmd" });

    const data = await stalkerRequest({
      type, action: "create_link", cmd, series: "", forced_storage: "undefined", disable_ad: "0", download: "0", JsHttpRequest: "1-xml"
    }, true);

    let url = cleanUrl(data?.js?.cmd || data?.js?.url || data?.cmd || data?.url || "");
    res.json({ ok: !!url, url, raw: data, error: url ? "" : "No play URL" });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get("/api/debug/:type/:action", async (req, res) => {
  try {
    await ensureAuth();
    const data = await stalkerRequest({
      type: req.params.type, action: req.params.action,
      genre: req.query.genre || "*", category: req.query.category || "*",
      fav: "0", sortby: "number", p: "1", JsHttpRequest: "1-xml"
    }, true);
    res.json({ ok: true, count: listFrom(data).length, data: listFrom(data), raw: data });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});
app.get(["/api/tmdb/search", "/tmdb/search"], async (req, res) => {
  try {
    const title = req.query.title;

    if (!title) {
      return res.json({
        ok: false,
        error: "Missing title"
      });
    }

    const response = await axios.get(
      "https://api.themoviedb.org/3/search/movie",
      {
        params: {
          api_key: TMDB_API_KEY,
          query: title
        }
      }
    );

    const movie = response.data.results?.[0];

    if (!movie) {
      return res.json({
        ok: false,
        error: "Not found"
      });
    }

    res.json({
      ok: true,
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      rating: movie.vote_average,
      year: movie.release_date?.substring(0, 4),

      poster: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : "",

      backdrop: movie.backdrop_path
        ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
        : ""
    });

  } catch (e) {
    res.json({
      ok: false,
      error: e.message
    });
  }
});


module.exports = app;

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend running on port ${PORT}`);
  });
}}}
}