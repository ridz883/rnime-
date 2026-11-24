/**
 * sokuja.js — read-only scraper client for SOKUJA (x6.sokuja.uk)
 *
 * UMD: require('sokuja') in Node, window.Sokuja in browser.
 * Supports process.env.SOKUJA_BASE override if upstream subdomain rotates.
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Sokuja = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BASE = (typeof process !== "undefined" && process.env && process.env.SOKUJA_BASE)
    ? String(process.env.SOKUJA_BASE).replace(/\/+$/, "")
    : "https://x6.sokuja.uk";

  var UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

  /* ------------------------------------------------------------------ utils */

  function entities(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&quot;/g, '"')
      .replace(/&#0*39;|&apos;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, function (_, n) {
        try { return String.fromCodePoint(+n); } catch (e) { return _; }
      })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) {
        try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return _; }
      })
      .replace(/&amp;/g, "&");
  }

  function clean(s) {
    return entities(String(s == null ? "" : s).replace(/<[^>]*>/g, " "))
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function decodeImage(u) {
    if (!u) return null;
    u = entities(u);
    try {
      var m = u.match(/[?&]url=([^&]+)/);
      if (m) u = decodeURIComponent(m[1]);
      else if (/^%2F|^%3A/.test(u)) u = decodeURIComponent(u);
    } catch (e) {}
    if (/^\//.test(u)) u = BASE + u;
    return u;
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function parseInput(x) {
    if (x == null) return { kind: "empty", value: "" };
    var s = String(x).trim();
    try {
      var u = new URL(s);
      if (u.hostname) {
        var p = u.pathname.replace(/\/+$/, "");
        if (/\/anime\//.test(p)) p = p.replace(/^\/anime\//, "/");
        return { kind: "url", value: p.replace(/^\/|\/$/g, "") };
      }
    } catch (e) {}
    s = s.replace(/^\/+|\/+$/g, "");
    var parts = s.split("/");
    if (parts.length > 1 && parts[0] === "anime") s = parts.slice(1).join("/");
    return { kind: "slug", value: s };
  }

  function jsonParseSafe(s) {
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function textLD(html) {
    var out = [];
    var re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    var m;
    while ((m = re.exec(html))) {
      var o = jsonParseSafe(clean(m[1]));
      if (o) out.push(o);
    }
    return out;
  }

  /** decoded Next.js RSC flight payload */
  function flight(html) {
    var out = "";
    var re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    var m;
    while ((m = re.exec(html))) {
      try { out += JSON.parse(m[1]); } catch (e) {}
    }
    return out;
  }

  function getMeta(html, name) {
    var m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]+content=["\']([^"\']+)', "i"));
    if (m) return entities(m[1]);
    m = html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']' + name + '["\']', "i"));
    return m ? entities(m[1]) : null;
  }

  function getTitle(html) {
    var m = html.match(/<title>([\s\S]*?)<\/title>/i);
    return m ? clean(m[1]) : null;
  }

  /** parse the "group block" cards used by home/list/genre/search pages */
  function parseCards(html) {
    var cards = [];
    var seen = {};
    var re = /<a(?:\s+class="group block")?\s+href="(\/[^"]+)"(?:\s+class="group block")?>([\s\S]*?)<\/a>/g;
    var m;
    while ((m = re.exec(html))) {
      var href = entities(m[1]);
      var body = m[2];
      if (!/class="group block"/.test(body) && !/class="group block"/.test(m[0])) continue;
      if (seen[href]) continue;
      seen[href] = 1;

      var im = body.match(/<img[^>]*?alt="([^"]*)"[\s\S]*?srcSet="([^"]+)"/i) ||
               body.match(/<img[^>]*?srcSet="([^"]+)"[\s\S]*?alt="([^"]*)"/i);
      var alt = "", srcset = "";
      if (im) {
        if (im[1] && /^https?:|^\//.test(im[1]) === false && im[2] && /url=/.test(im[2])) {
          alt = im[1]; srcset = im[2];
        } else if (im[2] && /url=/.test(im[2])) {
          srcset = im[2]; alt = im[1] || "";
        } else if (im[1] && /url=/.test(im[1])) {
          srcset = im[1]; alt = im[2] || "";
        } else { alt = im[1] || ""; srcset = im[2] || ""; }
      }
      var image = null;
      var first = (srcset.match(/(?:url=)?([^\s,]+?)(?:\s+\d+w|\s*$)/) || [])[1];
      if (first) {
        image = decodeImage(first);
      } else {
        var sm = body.match(/src="([^"]+)"/);
        if (sm) image = decodeImage(sm[1]);
      }

      var h3 = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      var ep = body.match(/>EP\s*(?:<!--\s*-->)?\s*(\d+)</i) ||
               body.match(/>Episode\s*(?:<!--\s*-->)?\s*(\d+)</i);
      var score = body.match(/text-yellow-400[^>]*>\s*★\s*(?:<!--\s*-->)?\s*([\d.]+)/i);
      var status = body.match(/bg-green-600\/80[^>]*>([\s\S]*?)</i);
      var type = body.match(/bg-primary\/90[^>]*>([\s\S]*?)</i);
      var year = body.match(/<p class="text-xs text-gray-400">\s*(\d{4})\s*<\/p>/);
      var ago = body.match(/>·\s*(?:<!--\s*-->)?\s*([^<]+)</);

      var isEpisode = /\/[^/]*episode-\d+-subtitle-indonesia\/?$/.test(href);
      var isAnime = /^\/anime\//.test(href);
      cards.push({
        href: href,
        slug: href.replace(/^\/anime\/|\/$/g, ""),
        url: BASE + href,
        type: isEpisode ? "episode" : isAnime ? "anime" : "page",
        title: clean(h3 ? h3[1] : alt),
        image: image,
        episode: ep ? +ep[1] : null,
        score: score ? +score[1] : null,
        status: status ? clean(status[1]) : null,
        badgeType: type ? clean(type[1]) : null,
        year: year ? +year[1] : null,
        ago: ago ? clean(ago[1]) : null
      });
    }
    return cards;
  }

  /* ---------------------------------------------------------------- network */

  async function request(path, opts) {
    opts = opts || {};
    var url = /^https?:\/\//.test(path) ? path : BASE + path;
    var tries = opts.retries == null ? 2 : opts.retries;
    var lastErr;

    var baseHeaders = {
      "User-Agent": UA,
      "Accept": opts.json
        ? "application/json, text/plain, */*"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Referer": BASE + "/",
      "Sec-Ch-Ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": opts.json ? "empty" : "document",
      "Sec-Fetch-Mode": opts.json ? "cors" : "navigate",
      "Sec-Fetch-Site": "same-origin"
    };
    if (!opts.json) {
      baseHeaders["Upgrade-Insecure-Requests"] = "1";
    }

    for (var i = 0; i < tries; i++) {
      try {
        var r = await fetch(url, {
          method: opts.method || "GET",
          headers: Object.assign({}, baseHeaders, opts.headers || {}),
          body: opts.body,
          redirect: "follow",
          signal: opts.signal
        });
        if (!r.ok) {
          var err = new Error("HTTP " + r.status + " for " + url);
          err.status = r.status;
          throw err;
        }
        return opts.json ? await r.json() : await r.text();
      } catch (e) {
        lastErr = e;
        if (e && e.status && e.status >= 400 && e.status < 500 && e.status !== 429) {
          throw e;
        }
        if (i < tries - 1) {
          await new Promise(function (resolve) { setTimeout(resolve, 400 * (i + 1)); });
        }
      }
    }
    throw lastErr;
  }

  function api(path) {
    return request(path, { json: true });
  }

  /* -------------------------------------------------------------- functions */

  function getSlug(x) { return parseInput(x).value; }

  function pathSlug(x) {
    var v = getSlug(x);
    return /\/anime\//.test(v) ? v.replace(/^\/anime\//, "") : v;
  }

  /** home: recent episodes, anime cards, pagination */
  async function getHome(page) {
    var path = "/" + (page && page > 1 ? "?page=" + encodeURIComponent(page) : "");
    var html = await request(path);
    var cards = parseCards(html);
    var paging = html.match(/[?&]page=(\d+)#update-terbaru/g) || [];
    var pageNums = paging.map(function (p) { return +p.match(/(\d+)/)[1]; });
    var counter = html.match(/>(\d+)<!-- -->\s*\/\s*<!-- -->(\d+)</);
    if (counter) pageNums.push(+counter[2]);
    return {
      page: page || 1,
      totalPages: pageNums.length ? Math.max.apply(null, pageNums) : null,
      episodes: cards.filter(function (c) { return c.type === "episode"; }),
      anime: cards.filter(function (c) { return c.type === "anime"; }),
      cards: cards,
      title: getTitle(html)
    };
  }

  /** official JSON search endpoint used by the site's typeahead */
  async function search(q, limit) {
    var u = "/api/search/?q=" + encodeURIComponent(q || "") +
      "&limit=" + encodeURIComponent(limit || 20);
    var data = await api(u);
    return (data.results || []).map(function (r) {
      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        url: BASE + "/anime/" + r.slug + "/",
        thumbnail: decodeImage(r.thumbnailUrl),
        cover: decodeImage(r.coverUrl),
        type: r.type,
        status: r.status,
        year: r.year,
        score: r.score == null ? null : +r.score,
        views: r.viewCount
      };
    });
  }

  /** server-rendered search results ( /?s=... ) */
  async function searchHTML(q) {
    var html = await request("/?s=" + encodeURIComponent(q || ""));
    return parseCards(html);
  }

  function parseInfo(html) {
    var info = {};
    var re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
    var m;
    while ((m = re.exec(html))) {
      var k = clean(m[1]).replace(/:$/, "");
      var v = clean(m[2]);
      if (k) info[k] = v;
    }
    return info;
  }

  /** anime detail page */
  async function getAnime(input) {
    var slug = pathSlug(input);
    var html = await request("/anime/" + slug + "/");
    var lds = textLD(html);
    var ld = lds.filter(function (o) { return /TVSeries|Movie|Anime/.test(o["@type"] || ""); })[0] || {};
    var info = parseInfo(html);

    var eps = [];
    var seen = {};
    var start = html.indexOf("Daftar Episode");
    var stop = start < 0 ? html.length : html.indexOf('id="komentar"', start);
    if (stop < 0) stop = html.length;
    var scope = start < 0 ? html : html.slice(start, stop);
    var ere = /<a[^>]+href="(\/[^"]*episode-\d+-subtitle-indonesia\/)"[^>]*>([\s\S]*?)<\/a>/gi;
    var em;
    while ((em = ere.exec(scope))) {
      var href = entities(em[1]);
      if (seen[href]) continue;
      seen[href] = 1;
      var nm = (em[2].match(/Episode\s*(\d+)/i) || href.match(/episode-(\d+)-/));
      var label = em[2].match(/<span class="text-gray-200">([\s\S]*?)<\/span>/);
      eps.push({
        number: nm ? +nm[1] : null,
        slug: href.replace(/^\/|\/$/g, ""),
        title: label ? clean(label[1]) : (clean(em[2]) || null),
        url: BASE + href
      });
    }
    eps.sort(function (a, b) { return (b.number || 0) - (a.number || 0); });

    var poster = decodeImage(ld.image || getMeta(html, "og:image") || null);
    var genres = Array.isArray(ld.genre) ? ld.genre : (ld.genre ? [ld.genre] : []);
    if (!genres.length && info.Genre) genres = info.Genre.split(/,\s*/);
    var synopsis = ld.description || null;
    if (!synopsis) {
      var sm = html.match(/Sinopsis[^<]*<\/h2>[\s\S]{0,400}?<div class="prose[^>]*>([\s\S]*?)<\/div>/i);
      if (sm) synopsis = clean(sm[1]);
    }

    return {
      slug: slug,
      url: BASE + "/anime/" + slug + "/",
      title: ld.name || getMeta(html, "og:title") || getTitle(html),
      alternativeTitles: ld.alternateName || null,
      synopsis: synopsis,
      poster: poster,
      cover: poster,
      type: info.Tipe || null,
      status: info.Status || null,
      year: info.Tahun || (ld.datePublished ? +String(ld.datePublished).slice(0, 4) : null),
      season: info.Musim || null,
      episodeCount: info.Episode ? +info.Episode : (ld.numberOfEpisodes || null),
      duration: info.Durasi || null,
      studio: info.Studio || null,
      director: info.Sutradara || null,
      producer: info.Produser || null,
      subtitle: info.Subtitle || null,
      fansub: info.Fansub || null,
      genres: genres,
      score: ld.aggregateRating ? ld.aggregateRating.ratingValue : null,
      votes: ld.aggregateRating ? ld.aggregateRating.ratingCount : null,
      info: info,
      episodes: eps,
      ld: lds
    };
  }

  /** list of episodes only */
  async function getEpisodes(input) {
    var a = await getAnime(input);
    return a.episodes;
  }

  /** episode page -> episodeId, neighbours, quality options, poster */
  async function getEpisode(input) {
    var v = getSlug(input);
    var slug = /^\d+$/.test(v) ? null : v;
    var html;
    if (slug) html = await request("/" + slug + "/");
    else html = await request("/api/video-mirrors/?e=" + v);

    var f = flight(html);
    var idMatch = f.match(/"episodeId"\s*:\s*(\d+)/) || html.match(/episodeId[\\"']*:[\\"']*(\d+)/);
    var id = idMatch ? +idMatch[1] : (/^\d+$/.test(v) ? +v : null);

    var posterM = f.match(/"posterUrl"\s*:\s*"([^"]+)"/);
    var titleM = f.match(/"posterAlt"\s*:\s*"([^"]+)"/);
    var numM = html.match(/<dd[^>]*>\s*(\d+)\s*dari\s*(\d+)\s*<\/dd>/i);
    var durM = html.match(/<dt[^>]*>Durasi<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i);
    var nextM = f.match(/"next"\s*:\s*\{\s*"slug"\s*:\s*"([^"]+)"\s*,\s*"title"\s*:\s*"([^"]*)"\s*,\s*"episodeNumber"\s*:\s*"([^"]*)"/);
    var prevM = f.match(/"prev"\s*:\s*\{\s*"slug"\s*:\s*"([^"]+)"\s*,\s*"title"\s*:\s*"([^"]*)"\s*,\s*"episodeNumber"\s*:\s*"([^"]*)"/);
    var qM = f.match(/"qualityOptions"\s*:\s*\[([^\]]*)\]/);
    var animeM = f.match(/"animeSlug"\s*:\s*"([^"]+)"/);

    var ld = textLD(html).filter(function (o) { return o["@type"] === "VideoObject"; })[0] || {};

    function nav(m) {
      return m ? { slug: m[1], title: clean(m[2]), number: m[3] } : null;
    }

    return {
      id: id,
      slug: slug,
      url: slug ? BASE + "/" + slug + "/" : null,
      title: titleM ? clean(titleM[1]) : (ld.name || getMeta(html, "og:title") || getTitle(html)),
      animeSlug: animeM ? animeM[1] : null,
      episode: numM ? +numM[1] : (slug ? ((slug.match(/episode-(\d+)-/) || [])[1] || null) : null),
      total: numM ? +numM[2] : null,
      duration: durM ? clean(durM[1]) : null,
      poster: posterM ? decodeImage(posterM[1]) : decodeImage(ld.thumbnailUrl || getMeta(html, "og:image")),
      description: ld.description || null,
      qualityOptions: qM ? (qM[1].match(/"([^"]+)"/g) || []).map(function (x) { return x.slice(1, -1); }) : [],
      prev: nav(prevM),
      next: nav(nextM),
      ld: ld
    };
  }

  /** direct mp4/embed mirrors per quality */
  async function getMirrors(episodeId) {
    var e = typeof episodeId === "object" ? episodeId.id : episodeId;
    var data = await api("/api/video-mirrors/?e=" + encodeURIComponent(e));
    return {
      episodeId: e,
      mirrors: (data.mirrors || []).map(function (m) {
        return {
          id: m.id,
          server: m.serverName,
          url: m.embedUrl,
          type: m.embedType,
          quality: m.quality
        };
      }),
      hostFallbacks: data.videoHostFallbacks || [],
      hostFallbackGroups: data.videoHostFallbackGroups || []
    };
  }

  /** convenience: episode input -> episode info + mirrors */
  async function getVideo(input) {
    var ep = await getEpisode(input);
    if (!ep.id) throw new Error("episodeId tidak ditemukan untuk " + input);
    var m = await getMirrors(ep.id);
    return Object.assign({}, ep, {
      mirrors: m.mirrors,
      hostFallbacks: m.hostFallbacks,
      hostFallbackGroups: m.hostFallbackGroups
    });
  }

  async function getPlaylist(slug) {
    var v = getSlug(slug);
    var data = await api("/api/playlist/?slug=" + encodeURIComponent(v));
    return { currentSlug: data.currentSlug || null, episodes: data.episodes || [] };
  }

  async function getComments(episodeId, opts) {
    opts = opts || {};
    var qs = "?";
    if (episodeId != null) qs += "episodeId=" + encodeURIComponent(typeof episodeId === "object" ? episodeId.id : episodeId) + "&";
    qs += "limit=" + encodeURIComponent(opts.limit || 10);
    if (opts.cursor != null && opts.cursor !== "") qs += "&cursor=" + encodeURIComponent(opts.cursor);
    var data = await api("/api/comments/" + qs);
    return {
      comments: data.comments || [],
      nextCursor: data.nextCursor || null,
      hasMore: !!data.hasMore,
      total: data.totalComments || 0
    };
  }

  async function getGenres() {
    var html = await request("/genre/");
    var out = [], seen = {};
    var re = /<a[^>]+href="\/genre\/([^"/]+)\/"[^>]*>([\s\S]*?)<\/a>/g;
    var m;
    while ((m = re.exec(html))) {
      if (seen[m[1]]) continue;
      seen[m[1]] = 1;
      var spans = m[2].match(/<span[^>]*>([\s\S]*?)<\/span>/g) || [];
      var name = spans.length ? clean(spans[0]) : clean(m[2]);
      var count = spans.length > 1 ? clean(spans[1]) : null;
      out.push({
        slug: m[1],
        name: name,
        count: count ? +(count.replace(/\D/g, "")) || null : null,
        url: BASE + "/genre/" + m[1] + "/"
      });
    }
    return out;
  }

  async function getAnimeList(opts) {
    opts = opts || {};
    var qs = [];
    if (opts.status) qs.push("status=" + encodeURIComponent(opts.status));
    if (opts.type) qs.push("type=" + encodeURIComponent(opts.type));
    if (opts.order) qs.push("order=" + encodeURIComponent(opts.order));
    if (opts.season) qs.push("season=" + encodeURIComponent(opts.season));
    if (opts.studio) qs.push("studio=" + encodeURIComponent(opts.studio));
    if (opts.page && +opts.page > 1) qs.push("page=" + encodeURIComponent(opts.page));
    var path = (opts.genre ? "/genre/" + slugify(opts.genre) + "/" : "/anime/") + (qs.length ? "?" + qs.join("&") : "");
    var html = await request(path);
    var cards = parseCards(html);
    var pg = html.match(/page=(\d+)/g) || [];
    var nums = pg.map(function (x) { return +x.match(/(\d+)/)[1]; });
    return {
      path: path,
      page: +opts.page || 1,
      totalPages: nums.length ? Math.max.apply(null, nums) : null,
      anime: cards.filter(function (c) { return c.type === "anime"; }),
      cards: cards
    };
  }

  function getGenre(genre, page) {
    return getAnimeList({ genre: genre, page: page });
  }

  async function getSchedule() {
    var html = await request("/jadwal-rilis-anime/");
    var days = {
      mon: "Senin",
      tue: "Selasa",
      wed: "Rabu",
      thu: "Kamis",
      fri: "Jumat",
      sat: "Sabtu",
      sun: "Minggu",
      end: "Sudah Selesai (END)"
    };
    var out = {};
    Object.keys(days).forEach(function (k) {
      var i = html.indexOf('id="' + k + '"');
      if (i < 0) {
        out[k] = { day: days[k], anime: [] };
        return;
      }
      var next = html.indexOf('<div id="', i + 10);
      var seg = html.slice(i, next < 0 ? html.length : next);
      out[k] = {
        day: days[k],
        anime: parseCards(seg).filter(function (c) { return c.type === "anime"; })
      };
    });
    return out;
  }

  /* ------------------------------------------------------------------- CLI */

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

  if (typeof require === "function" && typeof module !== "undefined" && require.main === module) {
    var cmd = process.argv[2] || "home";
    var arg = process.argv[3];
    var arg2 = process.argv[4];
    (async function () {
      var res;
      switch (cmd) {
        case "home": res = await getHome(+arg || 1); break;
        case "search": res = await search(arg || "one piece", +(arg2 || 20)); break;
        case "search-html": res = await searchHTML(arg || "one piece"); break;
        case "anime": res = await getAnime(arg || "one-piece-subtitle-indonesia"); break;
        case "episodes": res = await getEpisodes(arg || "one-piece-subtitle-indonesia"); break;
        case "episode": res = await getEpisode(arg || "dark-summoner-to-dekiteiru-episode-1-subtitle-indonesia"); break;
        case "mirrors": res = await getMirrors(+arg || 10922); break;
        case "video": res = await getVideo(arg || "dark-summoner-to-dekiteiru-episode-1-subtitle-indonesia"); break;
        case "playlist": res = await getPlaylist(arg || "dark-summoner-to-dekiteiru-episode-1-subtitle-indonesia"); break;
        case "comments": res = await getComments(arg ? +arg : 10922, { limit: +(arg2 || 5) }); break;
        case "genres": res = await getGenres(); break;
        case "genre": res = await getGenre(arg || "action", +arg2 || 1); break;
        case "list": res = await getAnimeList(jsonParseSafe(arg) || {}); break;
        case "schedule": res = await getSchedule(); break;
        default: throw new Error("Perintah: home|search|search-html|anime|episodes|episode|mirrors|video|playlist|comments|genres|genre|list|schedule");
      }
      console.log(JSON.stringify(res, null, 2));
    })().catch(function (e) { console.error("ERR:", e.message); process.exit(1); });
  }

  return API;
});
