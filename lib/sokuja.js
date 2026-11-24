/**
 * lib/sokuja.js — Drop-in Adapter menggunakan Jikan API v4 (MyAnimeList Public API)
 * Menggantikan sumber scraper yang diblokir WAF agar seluruh rute API & UI berjalan normal di Vercel.
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Sokuja = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BASE = "https://api.jikan.moe/v4";
  var _genreCache = null;

  /* ------------------------------------------------------------------ utils */

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function getSlug(x) {
    if (x == null) return "";
    var s = String(x).trim();
    try {
      var u = new URL(s);
      if (u.hostname) {
        var malM = u.pathname.match(/\/anime\/(\d+)/);
        if (malM) return malM[1];
        s = u.pathname.replace(/^\/+|\/+$/g, "");
      }
    } catch (e) {}
    s = s.replace(/^\/+|\/+$/g, "");
    if (/^anime\//.test(s)) s = s.replace(/^anime\//, "");
    return s;
  }

  function pathSlug(x) {
    var s = getSlug(x);
    var m = s.match(/^(\d+)-episode-\d+$/i);
    if (m) return m[1];
    return s;
  }

  function extractMalId(input) {
    var s = getSlug(input);
    var m = s.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function extractEpisodeNum(input) {
    var s = getSlug(input);
    var m = s.match(/episode-(\d+)/i);
    return m ? parseInt(m[1], 10) : 1;
  }

  function pickImage(item) {
    if (!item || !item.images) return null;
    var jpg = item.images.jpg || item.images.webp || {};
    return jpg.large_image_url || jpg.image_url || jpg.small_image_url || null;
  }

  function pickYear(item) {
    if (!item) return null;
    if (item.year) return item.year;
    if (item.aired && item.aired.prop && item.aired.prop.from && item.aired.prop.from.year) {
      return item.aired.prop.from.year;
    }
    return null;
  }

  function mapToCard(item, cardType) {
    var img = pickImage(item);
    var epNum = item.episodes || null;
    var isEp = cardType === "episode";
    var slug = isEp ? item.mal_id + "-episode-" + (epNum || 1) : String(item.mal_id);
    return {
      href: isEp ? "/" + slug + "/" : "/anime/" + item.mal_id + "/",
      slug: slug,
      url: item.url || "https://myanimelist.net/anime/" + item.mal_id,
      type: isEp ? "episode" : "anime",
      title: item.title || item.title_english || "Tanpa Judul",
      image: img,
      thumbnail: img,
      cover: img,
      episode: isEp ? (epNum || 1) : epNum,
      score: item.score != null ? +item.score : null,
      status: item.status || null,
      badgeType: item.type || null,
      year: pickYear(item),
      ago: item.broadcast && item.broadcast.string && item.broadcast.string !== "Unknown"
        ? item.broadcast.string
        : (item.season ? item.season.toUpperCase() + " " + (pickYear(item) || "") : null),
      views: item.members != null ? item.members : null
    };
  }

  function buildYoutubeEmbed(trailer) {
    if (!trailer) return null;
    if (trailer.youtube_id) {
      return "https://www.youtube.com/embed/" + encodeURIComponent(trailer.youtube_id) + "?rel=0";
    }
    if (trailer.embed_url) {
      return String(trailer.embed_url).replace(/autoplay=1/gi, "autoplay=0");
    }
    return null;
  }

  /* ---------------------------------------------------------------- network */

  async function request(path, opts) {
    opts = opts || {};
    var url = /^https?:\/\//.test(path) ? path : BASE + path;
    var tries = opts.retries == null ? 3 : opts.retries;
    var lastErr;

    for (var i = 0; i < tries; i++) {
      try {
        var r = await fetch(url, {
          method: opts.method || "GET",
          headers: Object.assign({ Accept: "application/json" }, opts.headers || {}),
          signal: opts.signal
        });
        if (r.status === 429) {
          var rateErr = new Error("HTTP 429 Rate Limit Jikan API");
          rateErr.status = 429;
          throw rateErr;
        }
        if (!r.ok) {
          var err = new Error("HTTP " + r.status + " for " + url);
          err.status = r.status;
          throw err;
        }
        return await r.json();
      } catch (e) {
        lastErr = e;
        if (e && e.status && e.status >= 400 && e.status < 500 && e.status !== 429) {
          throw e;
        }
        if (i < tries - 1) {
          await new Promise(function (resolve) { setTimeout(resolve, 650 * (i + 1)); });
        }
      }
    }
    throw lastErr;
  }

  async function resolveMalId(input) {
    var id = extractMalId(input);
    if (id) return id;
    var text = getSlug(input).replace(/-subtitle-indonesia$/i, "").replace(/-/g, " ").trim();
    if (!text) throw new Error("ID atau judul anime tidak valid.");
    var found = await search(text, 1);
    if (!found.length) throw new Error("Anime tidak ditemukan untuk: " + input);
    return found[0].id;
  }

  /* -------------------------------------------------------------- functions */

  async function getHome(page) {
    var p = Math.max(1, parseInt(page, 10) || 1);
    var res = await request("/seasons/now?page=" + p + "&limit=24&sfw=true");
    var list = Array.isArray(res.data) ? res.data : [];
    var episodes = list.slice(0, 12).map(function (it) { return mapToCard(it, "episode"); });
    var anime = list.map(function (it) { return mapToCard(it, "anime"); });
    var totalPages = res.pagination ? res.pagination.last_visible_page : null;

    return {
      page: p,
      totalPages: totalPages,
      episodes: episodes,
      anime: anime,
      cards: anime,
      title: "Anime Musim Ini (MyAnimeList / Jikan v4)"
    };
  }

  async function search(q, limit) {
    var lim = Math.min(25, Math.max(1, parseInt(limit, 10) || 20));
    var res = await request("/anime?q=" + encodeURIComponent(q || "") + "&limit=" + lim + "&sfw=true");
    return (res.data || []).map(function (r) {
      var img = pickImage(r);
      return {
        id: r.mal_id,
        slug: String(r.mal_id),
        title: r.title,
        url: r.url,
        thumbnail: img,
        cover: img,
        image: img,
        type: r.type,
        status: r.status,
        year: pickYear(r),
        score: r.score != null ? +r.score : null,
        views: r.members != null ? r.members : null
      };
    });
  }

  async function searchHTML(q) {
    var res = await request("/anime?q=" + encodeURIComponent(q || "") + "&limit=24&order_by=members&sort=desc&sfw=true");
    return (res.data || []).map(function (r) { return mapToCard(r, "anime"); });
  }

  async function fetchEpisodeList(malId, totalHint, animeUrl) {
    var eps = [];
    try {
      var epRes = await request("/anime/" + malId + "/episodes?page=1");
      var rows = Array.isArray(epRes.data) ? epRes.data : [];
      eps = rows.map(function (ep) {
        return {
          number: ep.mal_id,
          slug: malId + "-episode-" + ep.mal_id,
          title: ep.title || "Episode " + ep.mal_id,
          url: ep.url || animeUrl
        };
      });
    } catch (e) {
      eps = [];
    }

    if (!eps.length) {
      var count = Math.min(24, Math.max(1, parseInt(totalHint, 10) || 1));
      for (var i = 1; i <= count; i++) {
        eps.push({
          number: i,
          slug: malId + "-episode-" + i,
          title: count === 1 ? "Full / Trailer" : "Episode " + i,
          url: animeUrl
        });
      }
    }

    eps.sort(function (a, b) { return (b.number || 0) - (a.number || 0); });
    return eps;
  }

  async function getAnime(input) {
    var malId = await resolveMalId(input);
    var res = await request("/anime/" + malId + "/full");
    var a = res.data;
    if (!a) throw new Error("Detail anime tidak ditemukan.");

    var img = pickImage(a);
    var altTitles = [];
    if (a.title_english && a.title_english !== a.title) altTitles.push(a.title_english);
    if (a.title_japanese) altTitles.push(a.title_japanese);

    var episodes = await fetchEpisodeList(malId, a.episodes, a.url);
    var genres = (a.genres || []).concat(a.themes || []).map(function (g) { return g.name; });
    var streamingNames = (a.streaming || []).map(function (s) { return s.name; }).slice(0, 3);

    return {
      slug: String(a.mal_id),
      url: a.url,
      title: a.title,
      alternativeTitles: altTitles.length ? altTitles : null,
      synopsis: a.synopsis || null,
      poster: img,
      cover: img,
      type: a.type || null,
      status: a.status || null,
      year: pickYear(a),
      season: a.season ? a.season.charAt(0).toUpperCase() + a.season.slice(1) : null,
      episodeCount: a.episodes || episodes.length,
      duration: a.duration || null,
      studio: (a.studios || []).map(function (s) { return s.name; }).join(", ") || null,
      director: a.source || null,
      producer: (a.producers || []).map(function (p) { return p.name; }).join(", ") || null,
      subtitle: a.rating || "Umum",
      fansub: streamingNames.length ? streamingNames.join(", ") : "Official",
      genres: genres,
      score: a.score != null ? a.score : null,
      votes: a.scored_by != null ? a.scored_by : null,
      info: {
        Tipe: a.type,
        Status: a.status,
        Rating: a.rating,
        Sumber: a.source
      },
      episodes: episodes,
      ld: []
    };
  }

  async function getEpisodes(input) {
    var malId = await resolveMalId(input);
    return fetchEpisodeList(malId, 1, "https://myanimelist.net/anime/" + malId);
  }

  function buildMirrorsFromAnime(a) {
    var mirrors = [];
    var yt = buildYoutubeEmbed(a.trailer);
    if (yt) {
      mirrors.push({
        id: "yt-trailer",
        server: "YouTube Official Trailer",
        url: yt,
        type: "iframe",
        quality: "HD"
      });
    }
    (a.streaming || []).forEach(function (st, idx) {
      if (st && st.url) {
        mirrors.push({
          id: "stream-" + idx,
          server: st.name + " (Resmi)",
          url: st.url,
          type: "iframe",
          quality: "Official"
        });
      }
    });
    return mirrors;
  }

  async function getEpisode(input) {
    var malId = await resolveMalId(input);
    var epNum = extractEpisodeNum(input);
    var res = await request("/anime/" + malId + "/full");
    var a = res.data;
    if (!a) throw new Error("Data episode tidak ditemukan.");

    var total = a.episodes || null;
    var slug = malId + "-episode-" + epNum;
    var prev = epNum > 1
      ? { slug: malId + "-episode-" + (epNum - 1), title: "Episode " + (epNum - 1), number: String(epNum - 1) }
      : null;
    var next = (!total || epNum < total)
      ? { slug: malId + "-episode-" + (epNum + 1), title: "Episode " + (epNum + 1), number: String(epNum + 1) }
      : null;

    var mirrors = buildMirrorsFromAnime(a);
    var qualityOptions = Array.from(new Set(mirrors.map(function (m) { return m.quality; })));

    return {
      id: malId,
      slug: slug,
      url: a.url,
      title: a.title + " — Episode " + epNum,
      animeSlug: String(malId),
      episode: epNum,
      total: total,
      duration: a.duration || null,
      poster: pickImage(a),
      description: a.synopsis || null,
      qualityOptions: qualityOptions,
      prev: prev,
      next: next,
      mirrors: mirrors,
      hostFallbacks: [],
      hostFallbackGroups: [],
      ld: {}
    };
  }

  async function getMirrors(episodeId) {
    var malId = await resolveMalId(typeof episodeId === "object" ? episodeId.id : episodeId);
    var res = await request("/anime/" + malId + "/full");
    var a = res.data || {};
    return {
      episodeId: malId,
      mirrors: buildMirrorsFromAnime(a),
      hostFallbacks: [],
      hostFallbackGroups: []
    };
  }

  async function getVideo(input) {
    return getEpisode(input);
  }

  async function getPlaylist(slug) {
    var malId = await resolveMalId(slug);
    var eps = await fetchEpisodeList(malId, 1, "https://myanimelist.net/anime/" + malId);
    return {
      currentSlug: getSlug(slug),
      episodes: eps.map(function (e) {
        return {
          slug: e.slug,
          episodeNumber: e.number,
          number: e.number,
          title: e.title
        };
      })
    };
  }

  async function getComments(episodeId, opts) {
    opts = opts || {};
    var malId = await resolveMalId(typeof episodeId === "object" ? episodeId.id : episodeId);
    var page = Math.max(1, parseInt(opts.cursor, 10) || 1);
    var limit = Math.min(20, Math.max(1, parseInt(opts.limit, 10) || 10));
    var res = await request("/anime/" + malId + "/reviews?page=" + page);
    var rows = (res.data || []).slice(0, limit).map(function (r) {
      var text = String(r.review || "").trim();
      if (text.length > 550) text = text.slice(0, 550) + "...";
      return {
        author: r.user && r.user.username ? r.user.username : "Pengguna MAL",
        date: r.date ? String(r.date).slice(0, 10) : "",
        text: (r.score != null ? "[Skor " + r.score + "/10] " : "") + text
      };
    });
    var hasMore = !!(res.pagination && res.pagination.has_next_page);
    return {
      comments: rows,
      nextCursor: hasMore ? page + 1 : null,
      hasMore: hasMore,
      total: rows.length
    };
  }

  async function getGenres() {
    if (_genreCache) return _genreCache;
    var res = await request("/genres/anime");
    _genreCache = (res.data || []).map(function (g) {
      return {
        id: g.mal_id,
        slug: slugify(g.name),
        name: g.name,
        count: g.count || null,
        url: g.url
      };
    });
    return _genreCache;
  }

  async function getAnimeList(opts) {
    opts = opts || {};
    var page = Math.max(1, parseInt(opts.page, 10) || 1);
    var params = ["page=" + page, "limit=24", "sfw=true"];

    if (opts.genre) {
      var genres = await getGenres();
      var target = slugify(opts.genre);
      var match = genres.find(function (g) {
        return g.slug === target || String(g.id) === String(opts.genre);
      });
      if (match) params.push("genres=" + match.id);
    }

    if (opts.status) {
      var st = String(opts.status).toLowerCase();
      if (st === "ongoing" || st === "airing") params.push("status=airing");
      else if (st === "completed" || st === "complete") params.push("status=complete");
    }

    if (opts.type) {
      params.push("type=" + encodeURIComponent(String(opts.type).toLowerCase()));
    }

    if (opts.order) {
      var ord = String(opts.order).toLowerCase();
      if (ord === "popular") params.push("order_by=members&sort=desc");
      else if (ord === "rating") params.push("order_by=score&sort=desc");
      else if (ord === "title") params.push("order_by=title&sort=asc");
      else if (ord === "update") params.push("order_by=start_date&sort=desc");
    } else {
      params.push("order_by=popularity&sort=asc");
    }

    if (opts.studio) {
      params.push("q=" + encodeURIComponent(opts.studio));
    }

    var path = "/anime?" + params.join("&");
    var res = await request(path);
    var cards = (res.data || []).map(function (it) { return mapToCard(it, "anime"); });

    return {
      path: path,
      page: page,
      totalPages: res.pagination ? res.pagination.last_visible_page : null,
      anime: cards,
      cards: cards
    };
  }

  function getGenre(genre, page) {
    return getAnimeList({ genre: genre, page: page });
  }

  async function getSchedule() {
    var days = {
      mon: { day: "Senin", anime: [] },
      tue: { day: "Selasa", anime: [] },
      wed: { day: "Rabu", anime: [] },
      thu: { day: "Kamis", anime: [] },
      fri: { day: "Jumat", anime: [] },
      sat: { day: "Sabtu", anime: [] },
      sun: { day: "Minggu", anime: [] },
      end: { day: "Sudah Selesai (END)", anime: [] }
    };

    var dayMap = {
      mondays: "mon",
      tuesdays: "tue",
      wednesdays: "wed",
      thursdays: "thu",
      fridays: "fri",
      saturdays: "sat",
      sundays: "sun"
    };

    var p1 = await request("/seasons/now?page=1&limit=25&sfw=true");
    var p2 = { data: [] };
    try {
      p2 = await request("/seasons/now?page=2&limit=25&sfw=true");
    } catch (e) {}

    var seen = {};
    (p1.data || []).concat(p2.data || []).forEach(function (item) {
      if (!item || seen[item.mal_id]) return;
      seen[item.mal_id] = true;
      var card = mapToCard(item, "anime");
      var rawDay = item.broadcast && item.broadcast.day ? String(item.broadcast.day).toLowerCase() : "";
      var key = dayMap[rawDay] || (item.status === "Finished Airing" ? "end" : null);
      if (key && days[key]) {
        days[key].anime.push(card);
      } else {
        days.end.anime.push(card);
      }
    });

    return days;
  }

  function parseCards() { return []; }

  var API = {
    BASE: BASE,
    getSlug: getSlug,
    pathSlug: pathSlug,
    slugify: slugify,
    getHome: getHome,
    search: search,
    searchHTML: searchHTML,
    getAnime: getAnime,
    getEpisodes: getEpisodes,
    getEpisode: getEpisode,
    getMirrors: getMirrors,
    getVideo: getVideo,
    getPlaylist: getPlaylist,
    getComments: getComments,
    getGenres: getGenres,
    getGenre: getGenre,
    getAnimeList: getAnimeList,
    getSchedule: getSchedule,
    parseCards: parseCards,
    request: request
  };

  return API;
});
