/**
 * lib/sokuja.js — AniList GraphQL Adapter (Embeddable Official Trailer + External Streaming Links)
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Sokuja = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BASE = "https://graphql.anilist.co";
  var TIMEOUT_MS = 8500;
  var _genreCache = null;
  var _detailCache = new Map();

  var FALLBACK_GENRES = [
    "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy",
    "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery",
    "Psychological", "Romance", "Sci-Fi", "Slice of Life",
    "Sports", "Supernatural", "Thriller"
  ];

  var CARD_FIELDS = [
    "id",
    "siteUrl",
    "title { romaji english native userPreferred }",
    "coverImage { large medium }",
    "bannerImage",
    "format",
    "status",
    "season",
    "seasonYear",
    "episodes",
    "averageScore",
    "popularity",
    "startDate { year }",
    "nextAiringEpisode { episode airingAt }"
  ].join("\n");

  var DETAIL_FIELDS = [
    CARD_FIELDS,
    "description(asHtml: false)",
    "coverImage { extraLarge large }",
    "duration",
    "genres",
    "source",
    "studios(isMain: true) { nodes { name } }",
    "trailer { id site }",
    "externalLinks { site url type }",
    "streamingEpisodes { title thumbnail url site }"
  ].join("\n");

  /* ------------------------------------------------------------------ utils */

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function cleanDesc(s) {
    if (!s) return null;
    return String(s)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getSlug(x) {
    if (x == null) return "";
    var s = String(x).trim();
    try {
      var u = new URL(s);
      if (u.hostname) {
        var m = u.pathname.match(/\/anime\/(\d+)/);
        if (m) return m[1];
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
    return m ? m[1] : s;
  }

  function extractId(input) {
    var s = getSlug(input);
    var m = s.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function extractEpisodeNum(input) {
    var s = getSlug(input);
    var m = s.match(/episode-(\d+)/i);
    return m ? parseInt(m[1], 10) : 1;
  }

  function formatStatus(st) {
    var map = {
      RELEASING: "Ongoing",
      FINISHED: "Completed",
      NOT_YET_RELEASED: "Upcoming",
      CANCELLED: "Cancelled",
      HIATUS: "Hiatus"
    };
    return map[st] || st || null;
  }

  function formatType(fmt) {
    var map = {
      TV: "TV",
      TV_SHORT: "TV Short",
      MOVIE: "Movie",
      SPECIAL: "Special",
      OVA: "OVA",
      ONA: "ONA",
      MUSIC: "Music"
    };
    return map[fmt] || fmt || null;
  }

  function pickTitle(t) {
    if (!t) return "Tanpa Judul";
    return t.english || t.romaji || t.userPreferred || t.native || "Tanpa Judul";
  }

  function pickImage(m) {
    if (!m || !m.coverImage) return m && m.bannerImage ? m.bannerImage : null;
    return m.coverImage.extraLarge || m.coverImage.large || m.coverImage.medium || m.bannerImage || null;
  }

  function formatAiringLabel(m) {
    if (m.nextAiringEpisode && m.nextAiringEpisode.airingAt) {
      var diffSec = m.nextAiringEpisode.airingAt - Math.floor(Date.now() / 1000);
      if (diffSec > 0) {
        var days = Math.floor(diffSec / 86400);
        var hrs = Math.floor((diffSec % 86400) / 3600);
        return "EP " + m.nextAiringEpisode.episode + " dlm " + (days > 0 ? days + "h " : "") + hrs + "j";
      }
    }
    if (m.season && m.seasonYear) return m.season + " " + m.seasonYear;
    return m.startDate && m.startDate.year ? String(m.startDate.year) : null;
  }

  function mapToCard(m, cardType, overrideEp) {
    var img = pickImage(m);
    var isEp = cardType === "episode";
    var epNum = overrideEp != null
      ? overrideEp
      : (m.nextAiringEpisode && m.nextAiringEpisode.episode > 1
        ? m.nextAiringEpisode.episode - 1
        : (m.episodes || 1));
    var slug = isEp ? m.id + "-episode-" + epNum : String(m.id);

    return {
      href: isEp ? "/" + slug + "/" : "/anime/" + m.id + "/",
      slug: slug,
      url: m.siteUrl || "https://anilist.co/anime/" + m.id,
      type: isEp ? "episode" : "anime",
      title: pickTitle(m.title),
      image: img,
      thumbnail: img,
      cover: img,
      episode: isEp ? epNum : (m.episodes || null),
      score: m.averageScore != null ? +(m.averageScore / 10).toFixed(1) : null,
      status: formatStatus(m.status),
      badgeType: formatType(m.format),
      year: m.seasonYear || (m.startDate ? m.startDate.year : null),
      ago: formatAiringLabel(m),
      views: m.popularity != null ? m.popularity : null
    };
  }

  /* ---------------------------------------------------------------- network */

  async function gql(query, variables) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    try {
      var res = await fetch(BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ query: query, variables: variables || {} }),
        signal: controller.signal
      });

      var json = await res.json().catch(function () { return null; });
      if (!res.ok) {
        var msg = json && json.errors && json.errors[0] ? json.errors[0].message : ("HTTP " + res.status);
        var err = new Error("AniList Error: " + msg);
        err.status = res.status;
        throw err;
      }
      if (json && json.errors && json.errors.length && !json.data) {
        throw new Error("AniList GraphQL: " + json.errors[0].message);
      }
      return json ? json.data : {};
    } catch (e) {
      if (e && e.name === "AbortError") {
        var tErr = new Error("Koneksi ke AniList melebihi batas waktu (timeout). Silakan muat ulang.");
        tErr.status = 504;
        throw tErr;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(path) {
    return gql(path, {});
  }

  async function fetchMediaDetail(input) {
    var id = extractId(input);
    var cacheKey = id ? "id:" + id : "q:" + slugify(input);
    var cached = _detailCache.get(cacheKey);
    if (cached && Date.now() < cached.exp) return cached.data;

    var data;
    if (id) {
      data = await gql(
        "query($id: Int) { Media(id: $id, type: ANIME) {\n" + DETAIL_FIELDS + "\n} }",
        { id: id }
      );
    } else {
      var text = getSlug(input).replace(/-subtitle-indonesia$/i, "").replace(/-/g, " ").trim();
      if (!text) throw new Error("Slug atau judul anime tidak valid.");
      data = await gql(
        "query($search: String) { Media(search: $search, type: ANIME, isAdult: false) {\n" + DETAIL_FIELDS + "\n} }",
        { search: text }
      );
    }

    if (!data || !data.Media) throw new Error("Anime tidak ditemukan untuk: " + input);
    if (_detailCache.size > 100) _detailCache.clear();
    _detailCache.set(cacheKey, { data: data.Media, exp: Date.now() + 5 * 60 * 1000 });
    _detailCache.set("id:" + data.Media.id, { data: data.Media, exp: Date.now() + 5 * 60 * 1000 });
    return data.Media;
  }

  function buildEpisodeList(m) {
    var eps = [];
    var streaming = Array.isArray(m.streamingEpisodes) ? m.streamingEpisodes : [];
    if (streaming.length) {
      streaming.forEach(function (se, idx) {
        var numM = String(se.title || "").match(/Episode\s*(\d+)/i);
        var num = numM ? parseInt(numM[1], 10) : idx + 1;
        eps.push({
          number: num,
          slug: m.id + "-episode-" + num,
          title: se.title || "Episode " + num,
          url: se.url || m.siteUrl
        });
      });
    } else {
      var released = m.nextAiringEpisode && m.nextAiringEpisode.episode > 1
        ? m.nextAiringEpisode.episode - 1
        : (m.episodes || 1);
      var count = Math.min(48, Math.max(1, released));
      for (var i = 1; i <= count; i++) {
        eps.push({
          number: i,
          slug: m.id + "-episode-" + i,
          title: count === 1 && m.format === "MOVIE" ? "Full Movie / Trailer" : "Episode " + i,
          url: m.siteUrl
        });
      }
    }
    eps.sort(function (a, b) { return (b.number || 0) - (a.number || 0); });
    return eps;
  }

  /** Hanya masukkan player yang mendukung iframe (YouTube Trailer resmi) */
  function buildMirrors(m) {
    var mirrors = [];
    if (m.trailer && m.trailer.id && String(m.trailer.site).toLowerCase() === "youtube") {
      var vid = encodeURIComponent(m.trailer.id);
      mirrors.push({
        id: "yt-main",
        server: "YouTube Official Trailer",
        url: "https://www.youtube.com/embed/" + vid + "?rel=0&playsinline=1",
        type: "iframe",
        quality: "HD"
      });
      mirrors.push({
        id: "yt-nocookie",
        server: "YouTube Privacy Player",
        url: "https://www.youtube-nocookie.com/embed/" + vid + "?rel=0&playsinline=1",
        type: "iframe",
        quality: "HD"
      });
    }
    return mirrors;
  }

  /** Pisahkan platform streaming eksternal (Crunchyroll, Bilibili, Netflix, dll.) sebagai link tab baru */
  function buildExternalStreams(m, epNum) {
    var links = [];
    var seen = {};
    (m.externalLinks || []).forEach(function (link) {
      if (!link || !link.url || link.type !== "STREAMING") return;
      if (seen[link.url]) return;
      seen[link.url] = true;
      links.push({
        site: link.site || "Streaming Resmi",
        url: link.url
      });
    });

    (m.streamingEpisodes || []).forEach(function (se) {
      if (!se || !se.url) return;
      var numM = String(se.title || "").match(/Episode\s*(\d+)/i);
      if (numM && parseInt(numM[1], 10) === epNum && !seen[se.url]) {
        seen[se.url] = true;
        links.unshift({
          site: (se.site || "Episode Resmi") + " — EP " + epNum,
          url: se.url
        });
      }
    });

    return links;
  }

  /* -------------------------------------------------------------- functions */

  async function getHome(page) {
    var p = Math.max(1, parseInt(page, 10) || 1);
    var query = [
      "query($page: Int) {",
      "  airing: Page(page: $page, perPage: 12) {",
      "    pageInfo { currentPage lastPage hasNextPage }",
      "    media(type: ANIME, isAdult: false, status: RELEASING, sort: [TRENDING_DESC, POPULARITY_DESC]) {",
      CARD_FIELDS,
      "    }",
      "  }",
      "  popular: Page(page: $page, perPage: 18) {",
      "    pageInfo { currentPage lastPage hasNextPage }",
      "    media(type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) {",
      CARD_FIELDS,
      "    }",
      "  }",
      "}"
    ].join("\n");

    var data = await gql(query, { page: p });
    var airingList = data.airing && data.airing.media ? data.airing.media : [];
    var popList = data.popular && data.popular.media ? data.popular.media : [];
    var episodes = airingList.map(function (m) { return mapToCard(m, "episode"); });
    var anime = popList.map(function (m) { return mapToCard(m, "anime"); });
    var totalPages = data.popular && data.popular.pageInfo ? data.popular.pageInfo.lastPage : null;

    return {
      page: p,
      totalPages: totalPages,
      episodes: episodes,
      anime: anime,
      cards: anime,
      title: "Trending & Populer — AniList"
    };
  }

  async function search(q, limit) {
    var lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    var query = [
      "query($search: String, $perPage: Int) {",
      "  Page(page: 1, perPage: $perPage) {",
      "    media(type: ANIME, isAdult: false, search: $search, sort: [SEARCH_MATCH, POPULARITY_DESC]) {",
      CARD_FIELDS,
      "    }",
      "  }",
      "}"
    ].join("\n");

    var data = await gql(query, { search: String(q || ""), perPage: lim });
    var list = data.Page && data.Page.media ? data.Page.media : [];
    return list.map(function (m) {
      var card = mapToCard(m, "anime");
      card.id = m.id;
      return card;
    });
  }

  async function searchHTML(q) {
    return search(q, 24);
  }

  async function getAnime(input) {
    var m = await fetchMediaDetail(input);
    var img = pickImage(m);
    var alt = [];
    if (m.title) {
      if (m.title.romaji && m.title.romaji !== pickTitle(m.title)) alt.push(m.title.romaji);
      if (m.title.native) alt.push(m.title.native);
    }
    var studios = m.studios && m.studios.nodes ? m.studios.nodes.map(function (s) { return s.name; }) : [];
    var streamingSites = (m.externalLinks || [])
      .filter(function (l) { return l.type === "STREAMING"; })
      .map(function (l) { return l.site; })
      .slice(0, 3);

    var episodes = buildEpisodeList(m);

    return {
      slug: String(m.id),
      url: m.siteUrl || "https://anilist.co/anime/" + m.id,
      title: pickTitle(m.title),
      alternativeTitles: alt.length ? alt : null,
      synopsis: cleanDesc(m.description),
      poster: img,
      cover: m.bannerImage || img,
      type: formatType(m.format),
      status: formatStatus(m.status),
      year: m.seasonYear || (m.startDate ? m.startDate.year : null),
      season: m.season || null,
      episodeCount: m.episodes || episodes.length,
      duration: m.duration ? m.duration + " menit" : null,
      studio: studios.join(", ") || null,
      director: m.source || null,
      producer: studios[0] || null,
      subtitle: "Multi / Resmi",
      fansub: streamingSites.length ? streamingSites.join(", ") : "AniList",
      genres: m.genres || [],
      score: m.averageScore != null ? +(m.averageScore / 10).toFixed(1) : null,
      votes: m.popularity != null ? m.popularity : null,
      info: { Tipe: formatType(m.format), Status: formatStatus(m.status) },
      episodes: episodes,
      ld: []
    };
  }

  async function getEpisodes(input) {
    var m = await fetchMediaDetail(input);
    return buildEpisodeList(m);
  }

  async function getEpisode(input) {
    var m = await fetchMediaDetail(input);
    var epNum = extractEpisodeNum(input);
    var total = m.episodes || null;
    var slug = m.id + "-episode-" + epNum;
    var mirrors = buildMirrors(m);
    var externalStreams = buildExternalStreams(m, epNum);
    var qualityOptions = Array.from(new Set(mirrors.map(function (x) { return x.quality; })));
    var displayTitle = pickTitle(m.title);

    return {
      id: m.id,
      slug: slug,
      url: m.siteUrl,
      animeTitle: displayTitle,
      title: displayTitle + " — Episode " + epNum,
      animeSlug: String(m.id),
      episode: epNum,
      total: total,
      duration: m.duration ? m.duration + " menit" : null,
      poster: m.bannerImage || pickImage(m),
      description: cleanDesc(m.description),
      qualityOptions: qualityOptions,
      prev: epNum > 1 ? { slug: m.id + "-episode-" + (epNum - 1), title: "Episode " + (epNum - 1), number: String(epNum - 1) } : null,
      next: (!total || epNum < total) ? { slug: m.id + "-episode-" + (epNum + 1), title: "Episode " + (epNum + 1), number: String(epNum + 1) } : null,
      mirrors: mirrors,
      externalStreams: externalStreams,
      youtubeSearchUrl: "https://www.youtube.com/results?search_query=" + encodeURIComponent(displayTitle + " episode " + epNum + " sub indo"),
      hostFallbacks: [],
      hostFallbackGroups: [],
      ld: {}
    };
  }

  async function getMirrors(episodeId) {
    var m = await fetchMediaDetail(typeof episodeId === "object" ? episodeId.id : episodeId);
    return {
      episodeId: m.id,
      mirrors: buildMirrors(m),
      externalStreams: buildExternalStreams(m, 1),
      hostFallbacks: [],
      hostFallbackGroups: []
    };
  }

  async function getVideo(input) {
    return getEpisode(input);
  }

  async function getPlaylist(slug) {
    var m = await fetchMediaDetail(slug);
    var eps = buildEpisodeList(m);
    return {
      currentSlug: getSlug(slug),
      episodes: eps.map(function (e) {
        return { slug: e.slug, episodeNumber: e.number, number: e.number, title: e.title };
      })
    };
  }

  async function getComments(episodeId, opts) {
    opts = opts || {};
    var id = extractId(typeof episodeId === "object" ? episodeId.id : episodeId);
    if (!id) return { comments: [], nextCursor: null, hasMore: false, total: 0 };

    var page = Math.max(1, parseInt(opts.cursor, 10) || 1);
    var perPage = Math.min(20, Math.max(1, parseInt(opts.limit, 10) || 10));
    var query = [
      "query($id: Int, $page: Int, $perPage: Int) {",
      "  Media(id: $id, type: ANIME) {",
      "    reviews(page: $page, perPage: $perPage, sort: [RATING_DESC]) {",
      "      pageInfo { hasNextPage total }",
      "      nodes { id summary body score createdAt user { name } }",
      "    }",
      "  }",
      "}"
    ].join("\n");

    var data = await gql(query, { id: id, page: page, perPage: perPage });
    var rev = data.Media && data.Media.reviews ? data.Media.reviews : { pageInfo: {}, nodes: [] };
    var comments = (rev.nodes || []).map(function (r) {
      var raw = cleanDesc(r.summary || r.body || "");
      if (raw && raw.length > 500) raw = raw.slice(0, 500) + "...";
      return {
        author: r.user && r.user.name ? r.user.name : "Pengguna AniList",
        date: r.createdAt ? new Date(r.createdAt * 1000).toISOString().slice(0, 10) : "",
        text: (r.score != null ? "[Skor " + r.score + "/100] " : "") + (raw || "")
      };
    });

    var hasMore = !!(rev.pageInfo && rev.pageInfo.hasNextPage);
    return {
      comments: comments,
      nextCursor: hasMore ? page + 1 : null,
      hasMore: hasMore,
      total: (rev.pageInfo && rev.pageInfo.total) || comments.length
    };
  }

  async function getGenres() {
    if (_genreCache) return _genreCache;
    try {
      var data = await gql("query { GenreCollection }", {});
      var list = Array.isArray(data.GenreCollection) ? data.GenreCollection : FALLBACK_GENRES;
      _genreCache = list
        .filter(function (g) { return g && g !== "Hentai"; })
        .map(function (name) {
          return { slug: slugify(name), name: name, count: null, url: "https://anilist.co/search/anime/" + encodeURIComponent(name) };
        });
    } catch (e) {
      _genreCache = FALLBACK_GENRES.map(function (name) {
        return { slug: slugify(name), name: name, count: null, url: "https://anilist.co/search/anime/" + encodeURIComponent(name) };
      });
    }
    return _genreCache;
  }

  async function getAnimeList(opts) {
    opts = opts || {};
    var page = Math.max(1, parseInt(opts.page, 10) || 1);
    var varDefs = ["$page: Int", "$perPage: Int", "$sort: [MediaSort]"];
    var args = ["type: ANIME", "isAdult: false", "sort: $sort"];
    var vars = { page: page, perPage: 24 };

    var sortMap = {
      popular: ["POPULARITY_DESC"],
      rating: ["SCORE_DESC"],
      title: ["TITLE_ROMAJI"],
      update: ["UPDATED_AT_DESC"]
    };
    vars.sort = sortMap[String(opts.order || "").toLowerCase()] || ["TRENDING_DESC", "POPULARITY_DESC"];

    if (opts.genre) {
      var genres = await getGenres();
      var target = slugify(opts.genre);
      var found = genres.find(function (g) { return g.slug === target; });
      if (found) {
        varDefs.push("$genre: String");
        args.push("genre: $genre");
        vars.genre = found.name;
      }
    }

    if (opts.status) {
      var st = String(opts.status).toLowerCase();
      var mappedSt = st === "ongoing" || st === "airing" ? "RELEASING" : (st === "completed" || st === "complete" ? "FINISHED" : null);
      if (mappedSt) {
        varDefs.push("$status: MediaStatus");
        args.push("status: $status");
        vars.status = mappedSt;
      }
    }

    if (opts.type) {
      var tp = String(opts.type).toUpperCase();
      if (["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"].indexOf(tp) >= 0) {
        varDefs.push("$format: MediaFormat");
        args.push("format: $format");
        vars.format = tp;
      }
    }

    if (opts.season) {
      var sm = String(opts.season).toUpperCase().match(/(WINTER|SPRING|SUMMER|FALL)/);
      var ym = String(opts.season).match(/(19|20)\d{2}/);
      if (sm) {
        varDefs.push("$season: MediaSeason");
        args.push("season: $season");
        vars.season = sm[1];
      }
      if (ym) {
        varDefs.push("$seasonYear: Int");
        args.push("seasonYear: $seasonYear");
        vars.seasonYear = parseInt(ym[0], 10);
      }
    }

    if (opts.studio) {
      varDefs.push("$search: String");
      args.push("search: $search");
      vars.search = String(opts.studio).trim();
    }

    var query = [
      "query(" + varDefs.join(", ") + ") {",
      "  Page(page: $page, perPage: $perPage) {",
      "    pageInfo { currentPage lastPage hasNextPage }",
      "    media(" + args.join(", ") + ") {",
      CARD_FIELDS,
      "    }",
      "  }",
      "}"
    ].join("\n");

    var data = await gql(query, vars);
    var list = data.Page && data.Page.media ? data.Page.media : [];
    var cards = list.map(function (m) { return mapToCard(m, "anime"); });

    return {
      path: "/anilist/page/" + page,
      page: page,
      totalPages: data.Page && data.Page.pageInfo ? data.Page.pageInfo.lastPage : null,
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

    var nowSec = Math.floor(Date.now() / 1000);
    var startSec = nowSec - 86400;
    var endSec = nowSec + 6 * 86400;

    var query = [
      "query($start: Int, $end: Int) {",
      "  sched: Page(page: 1, perPage: 50) {",
      "    airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: [TIME]) {",
      "      airingAt",
      "      episode",
      "      media { isAdult\n" + CARD_FIELDS + "\n}",
      "    }",
      "  }",
      "  ended: Page(page: 1, perPage: 12) {",
      "    media(type: ANIME, isAdult: false, status: FINISHED, sort: [END_DATE_DESC, POPULARITY_DESC]) {",
      CARD_FIELDS,
      "    }",
      "  }",
      "}"
    ].join("\n");

    var data = await gql(query, { start: startSec, end: endSec });
    var jsDayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    var seenPerDay = {};

    var schedRows = data.sched && data.sched.airingSchedules ? data.sched.airingSchedules : [];
    schedRows.forEach(function (row) {
      if (!row || !row.media || row.media.isAdult) return;
      var wibDay = new Date((row.airingAt + 7 * 3600) * 1000).getUTCDay();
      var key = jsDayKeys[wibDay] || "mon";
      var dedup = key + ":" + row.media.id;
      if (seenPerDay[dedup]) return;
      seenPerDay[dedup] = true;
      days[key].anime.push(mapToCard(row.media, "anime", row.episode));
    });

    var endedRows = data.ended && data.ended.media ? data.ended.media : [];
    days.end.anime = endedRows.map(function (m) { return mapToCard(m, "anime"); });

    return days;
  }

  function parseCards() { return []; }

  return {
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
});
