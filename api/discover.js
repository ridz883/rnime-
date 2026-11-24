"use strict";

const sokuja = require("../lib/sokuja");
const { getQuery, sendJson, getCache, setCache } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const action = (q.action || "list").toLowerCase(); // genres | genre | list
  const refresh = q.refresh === "1" || q.refresh === "true";

  try {
    if (action === "genres") {
      const cacheKey = "discover:genres";
      if (!refresh) {
        const cached = getCache(cacheKey);
        if (cached) return sendJson(res, 200, { ok: true, cached: true, genres: cached });
      }
      const genres = await sokuja.getGenres();
      setCache(cacheKey, genres, 30 * 60 * 1000);
      return sendJson(res, 200, { ok: true, cached: false, count: genres.length, genres });
    }

    const opts = {
      genre: q.genre || "",
      status: q.status || "",
      type: q.type || "",
      order: q.order || "",
      season: q.season || "",
      studio: q.studio || "",
      page: Math.max(1, parseInt(q.page, 10) || 1)
    };

    const cacheKey = `discover:list:${JSON.stringify(opts)}`;
    if (!refresh) {
      const cached = getCache(cacheKey);
      if (cached) return sendJson(res, 200, { ok: true, cached: true, data: cached });
    }

    const data = action === "genre" && opts.genre
      ? await sokuja.getGenre(opts.genre, opts.page)
      : await sokuja.getAnimeList(opts);

    setCache(cacheKey, data, 5 * 60 * 1000);
    return sendJson(res, 200, { ok: true, cached: false, data });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Gagal memuat daftar katalog: " + (err.message || "Upstream error")
    });
  }
};
