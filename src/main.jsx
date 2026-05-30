import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import ReactDOM from "react-dom";
import "./style.css";

var BACKEND = "https://ottn-production.up.railway.app";
var PORTAL_DOMAIN = "portal.airtel4k.co";
var PORTAL_PATH = "/stalker_portal";
var PLACEHOLDER = "https://placehold.co/300x450/121420/9499c3?text=POOMANI+TV";
var PREMIUM_BG = "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=2070&auto=format&fit=crop";

function titleOf(x) {
  if (!x) return "No name";
  return x.title || x.name || x.o_name || x.fname || x.tv_genre_name || x.category_name || x.genre_title || "No name";
}
function idOf(x) {
  if (!x) return "none";
  var id = x.id || x.movie_id || x.series_id || x.category_id || x.genre_id || x.tv_genre_id || x.alias || x.name;
  if (!id && x.cmd) {
    var m = x.cmd.match(/series\/(\d+)/) || x.cmd.match(/series\s+(\d+)/) || x.cmd.match(/video\/(\d+)/);
    if (m) id = m[1];
  }
  return String(id || "item");
}
function cmdOf(x) {
  if (!x) return "";
  return x.cmd || x.cmd_1 || x.url || x.stream_url || x.file || (x.cmds && x.cmds[0] && x.cmds[0].url) || "";
}

function imageOf(item) {
  if (!item) return PLACEHOLDER;
  var url = item.poster || item.screenshot_uri || item.cover || item.logo || item.image || item.pic || "";
  var id = idOf(item);
  if (item.logo && !item.poster && (!url || url === "null" || url.length < 5)) {
    return "http://tvclub.us/logo/200_115_0/" + id + ".png";
  }
  if (!url || typeof url !== "string") return PLACEHOLDER;
  url = url.trim();
  if (url.indexOf("http") === 0) {
    return url.indexOf("tmdb.org") !== -1 ? url.replace("http://", "https://") : url;
  }
  if (url.indexOf("/t/p/") === 0 || url.indexOf("t/p/") === 0) {
    var p = url.indexOf("/") === 0 ? url : "/" + url;
    return "https://image.tmdb.org" + p;
  }
  var path = url.replace(/^(\.|\/)+/, "");
  if (path.indexOf("stalker_portal") !== -1) {
    return "http://" + PORTAL_DOMAIN + "/" + path.substring(path.indexOf("stalker_portal"));
  }
  return "http://" + PORTAL_DOMAIN + PORTAL_PATH + "/c/" + path;
}

function isSeries(it) {
  if (!it) return false;
  return it.model === "series" || it.kind === "series" || it.type === "series" || String(it.series) === "1" || String(it.vset) === "1" || (it.cmd && it.cmd.indexOf("series") !== -1);
}

function backdropOf(x) {
  if (!x) return "";
  var url = x.backdrop || x.screenshot_uri || x.poster || "";
  if (!url || typeof url !== "string") return imageOf(x);
  url = url.trim();
  if (url.indexOf("http") === 0) return url.indexOf("tmdb.org") !== -1 ? url.replace("http://", "https://") : url;
  if (url.indexOf("/t/p/") === 0 || url.indexOf("t/p/") === 0) {
    var p = url.indexOf("/") === 0 ? url : "/" + url;
    return "https://image.tmdb.org" + p;
  }
  var path = url.replace(/^(\.|\/)+/, "");
  if (path.indexOf("stalker_portal") !== -1) return "http://" + PORTAL_DOMAIN + "/" + path.substring(path.indexOf("stalker_portal"));
  return "http://" + PORTAL_DOMAIN + PORTAL_PATH + "/c/" + path;
}

function parseTrackLabel(info, fallback) {
  if (!info || typeof info !== "string") return fallback;
  var m = info.match(/language=([^,}\s]+)/i) || info.match(/name=([^,}\s]+)/i);
  if (m && m[1]) return m[1].toUpperCase();
  var clean = info.replace(/[{}]+/g, "").split(",")[0].split("=").pop();
  return (clean && clean.trim().substring(0, 20)) || fallback;
}

var PosterCard = memo(function(props) {
  var item = props.item, isFocused = props.isFocused, isActive = props.isActive, isFavorite = props.isFavorite, isSeries = props.isSeries;
  var initialImg = imageOf(item);
  var state = useState(initialImg);
  var imgSrc = state[0], setImgSrc = state[1];
  var isChannel = !!(item && item.logo && !item.poster);

  var handleImgError = function() {
    if (isChannel) {
      if (imgSrc.indexOf("tvclub.us") !== -1) {
        setImgSrc("http://" + PORTAL_DOMAIN + PORTAL_PATH + "/c/" + idOf(item));
      } else if (imgSrc.indexOf("/c/") !== -1) {
        var path = imgSrc.split("/c/")[1];
        setImgSrc("http://" + PORTAL_DOMAIN + PORTAL_PATH + "/external/icons/" + path);
      } else if (imgSrc !== PLACEHOLDER) {
        setImgSrc(PLACEHOLDER);
      }
    } else if (imgSrc !== PLACEHOLDER) {
      setImgSrc(PLACEHOLDER);
    }
  };
  
  return (
    <div className={"poster-card " + (isActive ? "active " : "") + (isFocused ? "focused " : "") + (isChannel ? "is-channel" : "")}>
      <img src={imgSrc} className="poster-img" alt="" onError={handleImgError} />
      {!isChannel && (
        <div className="poster-badges">
          {item.year && <span className="badge-year">{item.year}</span>}
          {item.rating && <span className="badge-rating">★ {item.rating}</span>}
          {isSeries && <span className="badge-series">SERIES</span>}
        </div>
      )}
      {isFavorite && <span className="material-symbols-outlined fav-indicator">star</span>}
      <div className="poster-card-inner">
        <span className="poster-title">{titleOf(item)}</span>
        {item.epg_progname && <span className="poster-epg">{item.epg_progname}</span>}
      </div>
    </div>
  );
});

var MENU = [
  { id: "Live streams", icon: "live_tv", label: "Live streams" },
  { id: "Shows archive", icon: "history", label: "Shows archive" },
  { id: "Media library", icon: "movie", label: "Media library" },
  { id: "Radio stations", icon: "radio", label: "Radio stations" },
  { id: "Search", icon: "search", label: "Search" },
  { id: "Favorites", icon: "favorite", label: "Favorites" },
  { id: "Settings", icon: "settings", label: "Settings" }
];

var PLAYER_CONTROLS = [
  { id: "play", icon: "play_arrow" },
  { id: "aspect", icon: "aspect_ratio" },
  { id: "fav", icon: "favorite" },
  { id: "audio", icon: "volume_up" },
  { id: "sub", icon: "closed_caption" },
  { id: "exit", icon: "close" }
];

function App() {
  var _section = useState("Live streams");
  var section = _section[0], setSection = _section[1];
  
  useEffect(function() {
    var script = document.createElement("script");
    script.src = "$WEBAPIS/webapis/webapis.js";
    script.onerror = function() { console.warn("WebAPI failed to load"); };
    document.head.appendChild(script);
  }, []);

  var _categories = useState([]);
  var categories = _categories[0], setCategories = _categories[1];
  var _items = useState([]);
  var items = _items[0], setItems = _items[1];
  var _archiveStore = useState([]);
  var archiveStore = _archiveStore[0], setArchiveStore = _archiveStore[1];
  var _favorites = useState(function() { return JSON.parse(localStorage.getItem("favs") || "[]"); });
  var favorites = _favorites[0], setFavorites = _favorites[1];
  var _searchQuery = useState("");
  var searchQuery = _searchQuery[0], setSearchQuery = _searchQuery[1];
  var _selectedCat = useState(null);
  var selectedCat = _selectedCat[0], setSelectedCat = _selectedCat[1];
  var _selectedItem = useState(null);
  var selectedItem = _selectedItem[0], setSelectedItem = _selectedItem[1];
  var _status = useState("Ready");
  var status = _status[0], setStatus = _status[1];
  var _playUrl = useState("");
  var playUrl = _playUrl[0], setPlayUrl = _playUrl[1];
  var _flashIcon = useState(null);
  var flashIcon = _flashIcon[0], setFlashIcon = _flashIcon[1];

  var _navZone = useState("menu");
  var navZone = _navZone[0], setNavZone = _navZone[1];
  var _focusIndex = useState(0);
  var focusIndex = _focusIndex[0], setFocusIndex = _focusIndex[1];
  var _showPlayerUI = useState(false);
  var showPlayerUI = _showPlayerUI[0], setShowPlayerUI = _showPlayerUI[1];
  var _aspectRatio = useState("contain");
  var aspectRatio = _aspectRatio[0], setAspectRatio = _aspectRatio[1];
  
  var _trackMenuType = useState(null); // "audio", "subtitle", null
  var trackMenuType = _trackMenuType[0], setTrackMenuType = _trackMenuType[1];
  
  var _tracks = useState({ audio: [], text: [] });
  var tracks = _tracks[0], setTracks = _tracks[1];
  var _duration = useState(0);
  var duration = _duration[0], setDuration = _duration[1];
  var _currentTime = useState(0);
  var currentTime = _currentTime[0], setCurrentTime = _currentTime[1];
  var _seekTarget = useState(0);
  var seekTarget = _seekTarget[0], setSeekTarget = _seekTarget[1];
  var _isSeeking = useState(false);
  var isSeeking = _isSeeking[0], setIsSeeking = _isSeeking[1];
  var _playbackSpeed = useState(1);
  var playbackSpeed = _playbackSpeed[0], setPlaybackSpeed = _playbackSpeed[1];

  var _avplayState = useState("NONE");
  var avplayState = _avplayState[0], setAvplayState = _avplayState[1];
  var _activeTrack = useState({ audio: -1, text: -1 });
  var activeTrack = _activeTrack[0], setActiveTrack = _activeTrack[1];

  var stateRef = useRef({});
  var searchInputRef = useRef(null);
  var videoRef = useRef(null);
  var controlsTimeout = useRef(null);
  var channelFlipTimeout = useRef(null);

  var filteredItems = useMemo(function() {
    return items.filter(function(it) {
      return !searchQuery || titleOf(it).toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1;
    });
  }, [items, searchQuery]);

  useEffect(function() {
    stateRef.current = { 
      navZone: navZone, focusIndex: focusIndex, section: section, categories: categories, items: items, favorites: favorites, 
      searchQuery: searchQuery, playUrl: playUrl, selectedItem: selectedItem, aspectRatio: aspectRatio, trackMenuType: trackMenuType, tracks: tracks, filteredItems: filteredItems,
      seekTarget: seekTarget, isSeeking: isSeeking, duration: duration, currentTime: currentTime, showPlayerUI: showPlayerUI, playbackSpeed: playbackSpeed, flashIcon: flashIcon, archiveStore: archiveStore,
      episodes: episodes, seasons: seasons, selectedSeason: selectedSeason, avplayState: avplayState, activeTrack: activeTrack
    };
  });

  useEffect(function() {
    if (playUrl) {
      document.body.classList.add("transparent");
    } else {
      document.body.classList.remove("transparent");
    }
  }, [playUrl]);

  var _episodes = useState([]);
  var episodes = _episodes[0], setEpisodes = _episodes[1];
  var _seasons = useState([]);
  var seasons = _seasons[0], setSeasons = _seasons[1];
  var _selectedSeason = useState(null);
  var selectedSeason = _selectedSeason[0], setSelectedSeason = _selectedSeason[1];

  var stopAVPlay = useCallback(function() {
    if (window.webapis && window.webapis.avplay) {
      try {
        window.webapis.avplay.stop();
        window.webapis.avplay.close();
        setAvplayState("NONE");
        setDuration(0);
        setCurrentTime(0);
        setTrackMenuType(null);
        setActiveTrack({ audio: -1, text: -1 });
      } catch (e) { console.error("AVPlay Stop Error", e); }
    }
  }, []);

  var triggerFlash = function(icon) {
    setFlashIcon(icon);
    setTimeout(function() { setFlashIcon(null); }, 800);
  };

  var resetControlsTimeout = useCallback(function() {
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    setShowPlayerUI(true);
    controlsTimeout.current = setTimeout(function() { setShowPlayerUI(false); }, 5000);
  }, []);

  var toggleFavorite = useCallback(function(item) {
    if (!item) return;
    setFavorites(function(prev) {
      var isFav = prev.some(function(f) { return idOf(f) === idOf(item); });
      var next = isFav ? prev.filter(function(f) { return idOf(f) !== idOf(item); }) : prev.concat([item]);
      localStorage.setItem("favs", JSON.stringify(next));
      return next;
    });
  }, []);

  var updateAspectRatio = function(mode) {
    setAspectRatio(mode);
    if (window.webapis && window.webapis.avplay) {
      try {
        if (mode === "contain") {
          window.webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
          window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
        } else if (mode === "fill") {
          window.webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_FULL_SCREEN");
          window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
        } else if (mode === "cover") {
          window.webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
          window.webapis.avplay.setDisplayRect(-120, -68, 2160, 1216);
        }
      } catch (e) {}
    }
  };

  var selectTrack = useCallback(function(type, id) {
    if (window.webapis && window.webapis.avplay) {
      try {
        // Use setSelectTrack (modern Tizen) with string type and numeric hardware index
        if (window.webapis.avplay.setSelectTrack) {
          window.webapis.avplay.setSelectTrack(type, id);
        } else {
          window.webapis.avplay.selectTrack(type, id);
        }
        
        setActiveTrack(function(prev) {
          var next = { audio: prev.audio, text: prev.text };
          if (type === "AUDIO") next.audio = id;
          else if (type === "TEXT") next.text = id;
          return next;
        });
        triggerFlash(type === "AUDIO" ? "volume_up" : "closed_caption");
      } catch (e) { 
        console.error("Track Selection Failed", e); 
        setStatus("Track Error: " + id);
      }
    }
  }, []);

  var initAVPlay = useCallback(async function(url) {
    if (!window.webapis || !window.webapis.avplay) return;
    stopAVPlay();
    try {
webapis.avplay.setListener({
  onbufferingstart: () => console.log("BUFFER START"),
  onbufferingprogress: (p) => console.log("BUFFER", p),
  onbufferingcomplete: () => console.log("BUFFER COMPLETE"),

  onstreamcompleted: () => console.log("STREAM COMPLETED"),

  onerror: (e) => console.log("AVPLAY ERROR", e),

  onerrormsg: (e, msg) => console.log("AVPLAY ERROR MSG", e, msg)
});
      window.webapis.avplay.open(url);
      setAvplayState("IDLE");
      
      try {
        window.webapis.avplay.setBufferingConfig("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", 10);
        window.webapis.avplay.setBufferingConfig("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", 5);
        window.webapis.avplay.setStreamingProperty("SET_MODE_4K", "TRUE");
        window.webapis.avplay.setStreamingProperty("ADAPTIVE_INFO", "FIXED_MAX_RESOLUTION=3840X2160");
      } catch (e) {}
      
      window.webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
      window.webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      
      var listener = {
        onbufferingstart: function() { setStatus("Buffering..."); setAvplayState("IDLE"); },
        onbufferingprogress: function(p) { setStatus("Buffering " + p + "%"); },
        onbufferingcomplete: function() { 
          setStatus("Playing"); setTimeout(function() { setStatus(""); }, 2000); setAvplayState("PLAYING");
          try { var st = window.webapis.avplay.getState(); if (st !== "PLAYING" && st !== "NONE") window.webapis.avplay.play(); } catch(e) {}
        },
        oncurrentplaytime: function(t) { if (!stateRef.current.isSeeking) setCurrentTime(t / 1000); },
        onerror: function(e) {
  console.log("AVPLAY ERROR =", e);
  setStatus("Playback Error " + e);
},
        onstreamcompleted: function() { stopAVPlay(); setPlayUrl(""); setNavZone("items"); }
      };
      window.webapis.avplay.setListener(listener);
      console.log("PLAY URL =", playUrl);
      window.webapis.avplay.prepareAsync(
function() {
        setAvplayState("READY");
        var curMode = stateRef.current.aspectRatio || "contain";
        if (curMode === "fill") window.webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_FULL_SCREEN");
        else if (curMode === "cover") window.webapis.avplay.setDisplayRect(-120, -68, 2160, 1216);
        else window.webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");

        setDuration(window.webapis.avplay.getDuration() / 1000);
        
        // Track Gathering
        var allTracks = window.webapis.avplay.getTotalTrackInfo();
        var audio = [];
        var text = [];
        var activeAud = -1, activeSub = -1;

        for (var i = 0; i < allTracks.length; i++) {
          var t = allTracks[i];
          // Use t.index if available, otherwise fallback to loop index
          var tIdx = (typeof t.index !== "undefined") ? t.index : i;
          var trackObj = { id: tIdx, label: parseTrackLabel(t.extra_info, (t.type === "AUDIO" ? "Audio " : "Subtitle ") + (audio.length + text.length + 1)) };
          
          if (t.type === "AUDIO") {
            audio.push(trackObj);
          } else if (t.type === "TEXT") {
            text.push(trackObj);
          }
        }
        
        setTracks({ audio: audio, text: text });
        
        // Try to identify initial active tracks if possible
        if (audio.length > 0) activeAud = audio[0].id;
        setActiveTrack({ audio: activeAud, text: activeSub });
        
        window.webapis.avplay.play();
setAvplayState("PLAYING");

},
function(err) {
  console.log("PREPARE FAILED =", err);
  setStatus("Prepare Failed " + err);
}
);
    } catch (e) { setStatus("Init Error"); }
  }, [stopAVPlay]);

  var playItem = useCallback(async function(item, immediate) {
    if (!item) return;
    setSelectedItem(item);
    setPlaybackSpeed(1);
    if (!immediate) {
      if (channelFlipTimeout.current) clearTimeout(channelFlipTimeout.current);
      channelFlipTimeout.current = setTimeout(function() { playItem(item, true); }, 1500);
      return;
    }
    setStatus("Loading Link...");
    var cmd = cmdOf(item);
    if (!cmd) return setStatus("No link");
    var type = stateRef.current.section === "Media library" ? "vod" : stateRef.current.section === "Radio stations" ? "radio" : "itv";
    try {
      var r = await fetch(BACKEND + "/api/create-link?type=" + type + "&cmd=" + encodeURIComponent(cmd));
      var j = await r.json();
      if (!j.ok || !j.url) return setStatus("Failed to get URL");
      
      setPlayUrl(j.url);
      setNavZone("player-controls");
      setFocusIndex(0);
      resetControlsTimeout();

      if (window.webapis && window.webapis.avplay) {
        initAVPlay(j.url);
      }
    } catch (e) { setStatus("Playback Error"); }
  }, [resetControlsTimeout, initAVPlay]);

  var loadSeriesInfo = async function(series) {
    setStatus("Loading Episodes...");
    var id = idOf(series);
    setEpisodes([]); setSeasons([]); setSelectedSeason(null);
    try {
      var r = await fetch(BACKEND + "/api/series-info?id=" + id);
      var j = await r.json();
      if (j.ok && j.data && j.data.length > 0) {
        var foundEps = j.data;
        setEpisodes(foundEps);
        var seasonMap = {};
        foundEps.forEach(function(ep) {
          var s = String(ep.season_number || ep.series_number || "1");
          if (!seasonMap[s]) seasonMap[s] = [];
          seasonMap[s].push(ep);
        });
        var sortedSeasons = Object.keys(seasonMap).sort(function(a, b) { return Number(a) - Number(b); });
        setSeasons(sortedSeasons);
        setSelectedSeason(sortedSeasons[0] || "1");
        setNavZone("seasons");
        setFocusIndex(0);
        setStatus("Found " + foundEps.length + " Episodes");
      } else {
        setStatus("No Episodes Found");
        playItem(series, true);
      }
    } catch (e) { setStatus("Load Error"); playItem(series, true); }
  };

  var loadItems = useCallback(async function(cat) {
    setSelectedCat(cat);
    var id = idOf(cat);
    setStatus("Loading...");
    setEpisodes([]); setSeasons([]); setSelectedSeason(null);
    if (stateRef.current.section === "Shows archive") {
      setItems(id === "*" ? stateRef.current.archiveStore : stateRef.current.archiveStore.filter(function(ch) { return ch.tv_genre_name === id; }));
      setNavZone("items"); setFocusIndex(0); setStatus("Ready");
      return;
    }
    if (stateRef.current.section === "Settings") {
      if (id === "reset") window.location.reload();
      setItems([{ title: "Backend: " + BACKEND }, { title: "MAC: 00:1A:79:00:33:73" }, { title: "Version: 5.8 Shotgun" }, { title: "Status: Online" }]);
      setNavZone("items"); setFocusIndex(0);
      return;
    }
    var path = stateRef.current.section === "Media library" ? "/api/vod-list?category=" + encodeURIComponent(id) :
               stateRef.current.section === "Radio stations" ? "/api/radio-list?genre=" + encodeURIComponent(id) :
               "/api/live-channels?genre=" + encodeURIComponent(id);
    try {
      var r = await fetch(BACKEND + path);
      var j = await r.json();
      if (j.ok) { setItems(j.data || []); setNavZone("items"); setFocusIndex(0); setStatus("Ready"); }
    } catch (e) { setStatus("Error loading items"); }
  }, []);

  var loadSection = useCallback(async function(secId) {
    setSection(secId); setSelectedCat(null); setSelectedItem(null); setSearchQuery(""); setEpisodes([]); setSeasons([]); setSelectedSeason(null); setStatus("Loading...");
    if (secId === "Favorites") {
      var saved = JSON.parse(localStorage.getItem("favs") || "[]");
      setItems(saved); setStatus("Favorites: " + saved.length); setNavZone("items"); setFocusIndex(0);
      return;
    }
    if (secId === "Search" || secId === "Settings") {
      if (secId === "Settings") setCategories([{ title: "Portal Info", id: "info" }, { title: "Reset Portal", id: "reset" }]);
      setStatus(secId); setNavZone(secId === "Search" ? "search-input" : "categories"); setFocusIndex(0);
      return;
    }
    if (secId === "Shows archive") {
      try {
        var r = await fetch(BACKEND + "/api/archive-categories");
        var j = await r.json();
        if (j.ok) {
          var channels = j.data || [];
          setArchiveStore(channels);
          var genreMap = {};
          channels.forEach(function(ch) {
            var name = (ch.tv_genre_name || "General").trim();
            if (name.toLowerCase().indexOf("adult") === -1) genreMap[name.toLowerCase()] = name;
          });
          var sortedGenres = Object.keys(genreMap).map(function(k) { return { title: genreMap[k], id: genreMap[k] }; })
            .sort(function(a, b) { return a.title.toLowerCase().indexOf("tamil") !== -1 ? -1 : (b.title.toLowerCase().indexOf("tamil") !== -1 ? 1 : a.title.localeCompare(b.title)); });
          
          setCategories(sortedGenres); 
          setNavZone("categories"); 
          setFocusIndex(0); 
          setStatus("Archive Ready");

          if (sortedGenres.length > 0) {
            var defaultCat = sortedGenres[0];
            for (var i = 0; i < sortedGenres.length; i++) {
              if (sortedGenres[i].title.toLowerCase().indexOf("tamil") !== -1) {
                defaultCat = sortedGenres[i];
                setFocusIndex(i);
                break;
              }
            }
            loadItems(defaultCat);
          }
        }
      } catch (e) { setStatus("Archive Fetch Error"); }
      return;
    }
    var path = secId === "Media library" ? "/api/media-library" : secId === "Radio stations" ? "/api/radio" : "/api/live-categories";
    try {
      var r = await fetch(BACKEND + path);
      var j = await r.json();
      if (j.ok) {
        var raw = j.data || [];
        var filtered = raw.filter(function(c) { return titleOf(c).toLowerCase().indexOf("adult") === -1; });
        var sorted = filtered.sort(function(a, b) { return titleOf(a).toLowerCase().indexOf("tamil") !== -1 ? -1 : (titleOf(b).toLowerCase().indexOf("tamil") !== -1 ? 1 : 0); });
        
        setCategories(sorted); 
        setStatus(secId + " Ready"); 
        setNavZone("categories"); 
        setFocusIndex(0);

        if (sorted.length > 0) {
          var defaultCat = sorted[0];
          for (var i = 0; i < sorted.length; i++) {
            if (titleOf(sorted[i]).toLowerCase().indexOf("tamil") !== -1) {
              defaultCat = sorted[i];
              setFocusIndex(i);
              break;
            }
          }
          loadItems(defaultCat);
        }
      } else setStatus("Fetch Failed");
    } catch (e) { setStatus("Network Error"); }
  }, [loadItems]);

  useEffect(function() { loadSection("Live streams"); }, [loadSection]);

  useEffect(function() { if (!isSeeking) setSeekTarget(currentTime); }, [currentTime, isSeeking]);

  useEffect(function() {
    if (window.tizen && window.tizen.tvinputdevice) {
      var keys = ["MediaPlay", "MediaPause", "MediaStop", "MediaFastForward", "MediaRewind", "MediaPlayPause", "VolumeUp", "VolumeDown", "VolumeMute", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue", "ChannelUp", "ChannelDown", "Info", "Guide", "Extra", "Search"];
      keys.forEach(function(k) { try { window.tizen.tvinputdevice.registerKey(k); } catch (e) {} });
    }
    var handleKey = function(e) {
      var key = e.keyCode || e.which;
      var s = stateRef.current;
      var handledKeys = [33, 34, 37, 38, 39, 40, 13, 10009, 461, 8, 27, 415, 19, 413, 417, 412, 10252, 403, 404, 405, 406, 427, 428, 10190, 10191, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 457, 458];
      if (handledKeys.indexOf(key) !== -1) e.preventDefault();
      
      // Shortcuts
      if (key === 403) { toggleFavorite(s.selectedItem); triggerFlash("favorite"); return; }
      if (key === 404) {
        var modes = ["contain", "fill", "cover"];
        var curIdx = modes.indexOf(s.aspectRatio);
        var nextMode = modes[(curIdx + 1) % modes.length];
        updateAspectRatio(nextMode);
        triggerFlash("aspect_ratio"); 
        return; 
      }
      if (key === 406) { loadSection("Search"); return; }
      
      // Global CH Up/Down (Added 33, 34, 10190, 10191)
      if ((key === 427 || key === 428 || key === 10190 || key === 10191 || key === 33 || key === 34) && s.section === "Live streams" && s.filteredItems.length > 0) {
        var cidx = s.filteredItems.findIndex(function(it) { return idOf(it) === idOf(s.selectedItem); });
        var nidx = 0;
        var isUp = (key === 427 || key === 10190 || key === 33);
        if (cidx !== -1) nidx = isUp ? (cidx + 1) % s.filteredItems.length : (cidx - 1 + s.filteredItems.length) % s.filteredItems.length;
        playItem(s.filteredItems[nidx], true);
        return;
      }

      // Return/Back
      if (key === 10009 || key === 461 || key === 8 || key === 27) {
        if (s.trackMenuType) { 
          var restoreIdx = s.trackMenuType === "audio" ? 3 : 4;
          setTrackMenuType(null); 
          setNavZone("player-controls"); 
          setFocusIndex(restoreIdx);
          return; 
        }
        if (s.navZone === "episodes") { setNavZone("seasons"); setFocusIndex(s.seasons.indexOf(s.selectedSeason)); return; }
        if (s.navZone === "seasons") { setNavZone("items"); setFocusIndex(s.filteredItems.findIndex(function(it) { return idOf(it) === idOf(s.selectedItem); })); return; }
        if (s.navZone.indexOf("player") === 0) { stopAVPlay(); setPlayUrl(""); setNavZone("items"); setFocusIndex(s.filteredItems.findIndex(function(it) { return idOf(it) === idOf(s.selectedItem); })); return; }
        if (s.navZone === "search-input") { setNavZone("menu"); setFocusIndex(MENU.findIndex(function(m) { return m.id === "Search"; })); return; }
        if (s.navZone === "items") { setNavZone(s.section === "Search" ? "search-input" : (s.categories.length ? "categories" : "menu")); return; }
        if (s.navZone === "categories") { setNavZone("menu"); setFocusIndex(MENU.findIndex(function(m) { return m.id === s.section; })); return; }
        return;
      }

      // Player Control
      if (s.playUrl) {
        resetControlsTimeout();
        if (key === 415 || key === 10252 || key === 19) {
          if (window.webapis && window.webapis.avplay) {
            var st = window.webapis.avplay.getState();
            if (st === "PLAYING") { window.webapis.avplay.pause(); setAvplayState("PAUSED"); triggerFlash("pause"); setShowPlayerUI(true); }
            else { window.webapis.avplay.play(); setAvplayState("PLAYING"); triggerFlash("play_arrow"); resetControlsTimeout(); }
          }
          return;
        }
        if (key === 417 || (key === 39 && s.navZone === "player-seekbar")) {
          if (s.section !== "Live streams") { var n = Math.min(s.duration, (s.isSeeking ? s.seekTarget : s.currentTime) + 30); setIsSeeking(true); setSeekTarget(n); return; }
        }
        if (key === 412 || (key === 37 && s.navZone === "player-seekbar")) {
          if (s.section !== "Live streams") { var n = Math.max(0, (s.isSeeking ? s.seekTarget : s.currentTime) - 30); setIsSeeking(true); setSeekTarget(n); return; }
        }
        if (key === 413) { stopAVPlay(); setPlayUrl(""); setNavZone("items"); return; }
      }

      var seasonEps = s.episodes.filter(function(e) { return String(e.season_number || e.series_number || "1") === String(s.selectedSeason); });
      var counts = { 
        menu: MENU.length, categories: s.categories.length + (s.section === "Settings" ? 0 : 1), items: s.filteredItems.length, 
        "player-controls": PLAYER_CONTROLS.length, seasons: s.seasons.length, episodes: seasonEps.length, 
        "tracks-audio": s.tracks.audio.length, "tracks-subtitle": s.tracks.text.length 
      };

      if (key === 38) { // UP
        if (s.navZone === "tracks-audio" || s.navZone === "tracks-subtitle") setFocusIndex(function(v) { return Math.max(0, v - 1); });
        else if (s.navZone === "items") { if (s.focusIndex < 5) { if (s.section === "Search") { setNavZone("search-input"); setFocusIndex(0); } else if (s.categories.length) { setNavZone("categories"); setFocusIndex(0); } else { setNavZone("menu"); setFocusIndex(MENU.findIndex(function(m) { return m.id === s.section; })); } } else setFocusIndex(function(v) { return Math.max(0, v - 5); }); }
        else if (s.navZone === "player-controls") { if (s.section !== "Live streams") setNavZone("player-seekbar"); }
        else if (s.navZone === "menu") setFocusIndex(function(v) { return Math.max(0, v - 1); });
        else if (s.navZone === "categories") { setNavZone("menu"); setFocusIndex(MENU.findIndex(function(m) { return m.id === s.section; })); }
        else if (s.navZone === "seasons" || s.navZone === "episodes") setFocusIndex(function(v) { return Math.max(0, v - 1); });
      } else if (key === 40) { // DOWN
        if (s.navZone === "tracks-audio" || s.navZone === "tracks-subtitle") setFocusIndex(function(v) { return Math.min(counts[s.navZone] - 1, v + 1); });
        else if (s.navZone === "items") setFocusIndex(function(v) { return Math.min(counts.items - 1, v + 5); });
        else if (s.navZone === "player-seekbar") { setNavZone("player-controls"); setFocusIndex(0); }
        else if (s.navZone === "menu") setFocusIndex(function(v) { return Math.min(counts.menu - 1, v + 1); });
        else if (s.navZone === "categories" || s.navZone === "search-input") { if (counts.items > 0) { setNavZone("items"); setFocusIndex(0); } }
        else if (s.navZone === "seasons" || s.navZone === "episodes") setFocusIndex(function(v) { return Math.min(counts[s.navZone] - 1, v + 1); });
      } else if (key === 37) { // LEFT
        if (s.navZone === "items") { if (s.focusIndex % 5 === 0) { setNavZone("menu"); setFocusIndex(MENU.findIndex(function(m) { return m.id === s.section; })); } else setFocusIndex(function(v) { return Math.max(0, v - 1); }); }
        else if (s.navZone === "categories") { if (s.focusIndex === 0) { setNavZone("menu"); setFocusIndex(MENU.findIndex(function(m) { return m.id === s.section; })); } else setFocusIndex(function(v) { return Math.max(0, v - 1); }); }
        else if (s.navZone === "player-controls") setFocusIndex(function(v) { return Math.max(0, v - 1); });
        else if (s.navZone === "episodes") { setNavZone("seasons"); setFocusIndex(s.seasons.indexOf(s.selectedSeason)); }
      } else if (key === 39) { // RIGHT
        if (s.navZone === "menu") { if (s.section === "Search") { setNavZone("search-input"); setFocusIndex(0); } else if (s.categories.length) { setNavZone("categories"); setFocusIndex(0); } else if (counts.items) { setNavZone("items"); setFocusIndex(0); } }
        else if (s.navZone === "player-controls") setFocusIndex(function(v) { return Math.min(counts["player-controls"] - 1, v + 1); });
        else if (s.navZone === "categories" || s.navZone === "items") setFocusIndex(function(v) { return Math.min(counts[s.navZone] - 1, v + 1); });
        else if (s.navZone === "seasons") { if (counts.episodes > 0) { setNavZone("episodes"); setFocusIndex(0); } }
      } else if (key === 13) { // ENTER
        if (s.navZone === "tracks-audio") { 
          var tObj = s.tracks.audio[s.focusIndex];
          selectTrack("AUDIO", tObj.id); 
          setTrackMenuType(null); 
          setNavZone("player-controls"); 
          setFocusIndex(3);
        }
        else if (s.navZone === "tracks-subtitle") { 
          var tObj = s.tracks.text[s.focusIndex];
          selectTrack("TEXT", tObj.id); 
          setTrackMenuType(null); 
          setNavZone("player-controls"); 
          setFocusIndex(4);
        }
        else if (s.navZone === "menu") loadSection(MENU[s.focusIndex].id);
        else if (s.navZone === "categories") { var hasAll = s.section !== "Settings"; loadItems(s.categories[hasAll ? s.focusIndex : s.focusIndex]); }
        else if (s.navZone === "items") { var item = s.filteredItems[s.focusIndex]; if (s.section === "Media library" && isSeries(item)) { setSelectedItem(item); loadSeriesInfo(item); } else playItem(item, true); }
        else if (s.navZone === "seasons") { setSelectedSeason(s.seasons[s.focusIndex]); setFocusIndex(0); }
        else if (s.navZone === "episodes") { playItem(seasonEps[s.focusIndex], true); }
        else if (s.navZone === "player-seekbar" || s.isSeeking) { if (window.webapis && window.webapis.avplay) window.webapis.avplay.seekTo(s.seekTarget * 1000); setIsSeeking(false); }
        else if (s.navZone === "player-controls") {
          var ctrl = PLAYER_CONTROLS[s.focusIndex].id;
          if (ctrl === "play") { if (window.webapis && window.webapis.avplay) { var st = window.webapis.avplay.getState(); if (st === "PLAYING") { window.webapis.avplay.pause(); setAvplayState("PAUSED"); triggerFlash("pause"); } else { window.webapis.avplay.play(); setAvplayState("PLAYING"); triggerFlash("play_arrow"); } } }
          if (ctrl === "aspect") { var m = ["contain", "fill", "cover"]; updateAspectRatio(m[(m.indexOf(s.aspectRatio) + 1) % m.length]); triggerFlash("aspect_ratio"); }
          if (ctrl === "fav") toggleFavorite(s.selectedItem);
          if (ctrl === "audio") { setTrackMenuType("audio"); setNavZone("tracks-audio"); setFocusIndex(0); }
          if (ctrl === "sub") { setTrackMenuType("subtitle"); setNavZone("tracks-subtitle"); setFocusIndex(0); }
          if (ctrl === "exit") { stopAVPlay(); setPlayUrl(""); setNavZone("items"); }
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return function() { window.removeEventListener("keydown", handleKey); };
  }, [playItem, loadSection, loadItems, stopAVPlay, triggerFlash, resetControlsTimeout, toggleFavorite, selectTrack, navZone]);

  useEffect(function() {
    var el = document.querySelector(".focused");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (navZone === "items") {
      var timer = setTimeout(function() { var it = filteredItems[focusIndex]; if (it) setSelectedItem(it); }, 400); 
      return function() { clearTimeout(timer); };
    }
  }, [focusIndex, navZone, filteredItems]);

  var formatTime = function(s) {
    if (!s || isNaN(s)) return "00:00";
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), rs = Math.floor(s % 60);
    return (h > 0 ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(rs).padStart(2, "0");
  };

  return (
    <div className={"app " + (playUrl ? "transparent" : "")}>
      <div className="app-bg" style={{ backgroundImage: "url('" + PREMIUM_BG + "')", display: playUrl ? "none" : "block" }}></div>
      <aside className={"side " + (navZone === "menu" ? "expanded" : "")}>
        <div className="logo-box"><span className="material-symbols-outlined logo-mark">rocket_launch</span><span className="logo-text">POOMANI</span></div>
        <div className="nav-list">{MENU.map(function(m, i) { return ( <button key={m.id} className={"nav-item " + (section === m.id ? "active " : "") + (navZone === "menu" && focusIndex === i ? "focused" : "")}> <span className="material-symbols-outlined">{m.icon}</span><span className="label">{m.label}</span> </button> ); })}</div>
      </aside>
      <main className="main-stage">
        {section === "Media library" && selectedItem && ( <div className="hero-banner"> <div className="hero-backdrop" style={{ backgroundImage: "url('" + backdropOf(selectedItem) + "')" }}></div> <div className="hero-content"> <h1 className="hero-title">{titleOf(selectedItem)}</h1> <div className="hero-meta">{selectedItem.year && <span className="meta-year">{selectedItem.year}</span>}{selectedItem.rating && <span className="meta-rating">★ {selectedItem.rating}</span>}</div> <p className="hero-overview">{selectedItem.overview || selectedItem.description || "No description available."}</p> </div> </div> )}
        {seasons.length > 0 && ( <div className="series-detail-layer"> <div className="seasons-column"> <h3>Seasons</h3> {seasons.map(function(s, i) { return ( <div key={s} className={"season-item " + (selectedSeason === s ? "active " : "") + (navZone === "seasons" && focusIndex === i ? "focused" : "")}>Season {s}</div> ); })} </div> <div className="episodes-column"> <h3>Episodes - Season {selectedSeason}</h3> <div className="episodes-grid"> {episodes.filter(function(e) { return String(e.season_number || e.series_number || "1") === String(selectedSeason); }).map(function(ep, i) { return ( <div key={idOf(ep) + i} className={"episode-card " + (navZone === "episodes" && focusIndex === i ? "focused" : "")}> <div className="ep-num">{i + 1}</div> <div className="ep-info"> <div className="ep-title">{titleOf(ep)}</div> </div> </div> ); })} </div> </div> </div> )}
        <h1 className="section-title">{section}</h1>
        {section === "Search" && ( <div className="search-box"><input ref={searchInputRef} type="text" placeholder="Search content..." value={searchQuery} onChange={function(e) { setSearchQuery(e.target.value); }} className={navZone === "search-input" ? "focused" : ""} /></div> )}
        <p className="section-meta">{status}</p>
        <section className={"cat-shelf " + (navZone === "categories" ? "focused-zone" : "")}> {categories.map(function(c, i) { return ( <div key={idOf(c) + i} className={"cat-chip " + (selectedCat === c ? "active " : "") + (navZone === "categories" && focusIndex === i ? "focused" : "")}>{titleOf(c)}</div> ); })} </section>
        <section className={"content-grid " + (navZone === "items" ? "focused-zone" : "")}> {filteredItems.map(function(it, i) { return ( <PosterCard key={idOf(it) + i} item={it} isFocused={navZone === "items" && focusIndex === i} isActive={idOf(selectedItem) === idOf(it)} isFavorite={favorites.some(function(f) { return idOf(f) === idOf(it); })} isSeries={isSeries(it)} /> ); })} </section>
      </main>
      <div className={"player-layer " + (playUrl ? "active transparent" : "")}>
        <div className={"player-overlay " + (showPlayerUI ? "visible" : "")}>
          <div className="player-info"><h2>{selectedItem ? titleOf(selectedItem) : "Streaming"}</h2>{selectedItem && selectedItem.epg_progname && <p className="player-epg-now">{selectedItem.epg_progname}</p>}{playbackSpeed !== 1 && <span className="speed-badge">{playbackSpeed}x</span>}</div>
          {section !== "Live streams" && section !== "Radio stations" && ( <div className={"player-progress-container " + (navZone === "player-seekbar" ? "focused" : "")}> <span className="time-text">{formatTime(isSeeking ? seekTarget : currentTime)}</span> <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: (((isSeeking ? seekTarget : currentTime) / (duration || 1)) * 100) + "%" }}></div>{isSeeking && <div className="seek-pointer" style={{ left: ((seekTarget / (duration || 1)) * 100) + "%" }}></div>}</div> <span className="time-text">{formatTime(duration)}</span> </div> )}
          <div className="player-controls">{PLAYER_CONTROLS.map(function(ctrl, i) { return ( <div key={ctrl.id} className={"control-btn " + (navZone === "player-controls" && focusIndex === i ? "focused" : "")}><span className="material-symbols-outlined">{ctrl.icon}</span></div> ); })}</div>
        </div>
        {flashIcon && <div className="flash-overlay"><span className="material-symbols-outlined">{flashIcon}</span></div>}
        
        {trackMenuType === "audio" && (
          <div className="tracks-menu">
            <h3>Audio Tracks</h3>
            <div className="tracks-list">
              {tracks.audio.length > 0 ? tracks.audio.map(function(t, i) { 
                return ( <div key={t.id} className={"track-item " + (activeTrack.audio === t.id ? "active " : "") + (navZone === "tracks-audio" && focusIndex === i ? "focused" : "")}> {t.label} </div> ); 
              }) : <p>Default</p>}
            </div>
          </div>
        )}
        
        {trackMenuType === "subtitle" && (
          <div className="tracks-menu">
            <h3>Subtitles</h3>
            <div className="tracks-list">
              {tracks.text.length > 0 ? tracks.text.map(function(t, i) { 
                return ( <div key={t.id} className={"track-item " + (activeTrack.text === t.id ? "active " : "") + (navZone === "tracks-subtitle" && focusIndex === i ? "focused" : "")}> {t.label} </div> ); 
              }) : <p>None</p>}
            </div>
          </div>
        )}
      </div>
      <div className="status-indicator">{status}</div>
    </div>
  );
}

try {
  var root = document.getElementById("root");
  if (ReactDOM.createRoot) { ReactDOM.createRoot(root).render(<App />); } 
  else { ReactDOM.render(<App />, root); }
} catch (e) {
  console.error("Critical App Crash", e);
  document.getElementById("root").innerHTML = '<div style="padding:50px;color:red;"><h1>Application Error</h1><p>' + e.message + '</p><button onclick="window.location.reload()">Reload</button></div>';
}
