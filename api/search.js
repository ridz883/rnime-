"use strict";

const sokuja = require("../lib/sokuja");
const { getQuery, sendJson, getCache, setCache } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const queryText = String(q.q || "").trim();
  const mode = (q.mode || "json").toLowerCase(); // json | html | resolve
  const limit = Math.min(50, Math.max(1, parseInt(q.limit, 10) || 20));

  if (!queryText) {
    return sendJson(res, 400, { ok: false, error: "Kata kunci pencarian tidak boleh kosong." });
  }

  if (mode === "resolve") {
    const rawSlug = sokuja.getSlug(queryText);
    const animeSlug = sokuja.pathSlug(queryText);
    const isEpisode = /episode-\d+/i.test(rawSlug) || /^\d+$/.test(rawSlug);
    return sendJson(res, 200, {
      ok: true,
      mode: "resolve",
      data: {
        input: queryText,
        slug: isEpisode ? rawSlug : animeSlug,
        kind: isEpisode ? "episode" : "anime",
        slugified: sokuja.slugify(queryText)
      }
    });
  }

  const cacheKey = `search:${mode}:${limit}:${queryText.toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return sendJson(res, 200, { ok: true, cached: true, mode, query: queryText, limit, results: cached });

  try {
    const results = mode === "html"
      ? await sokuja.searchHTML(queryText)
      : await sokuja.search(queryText, limit);

    setCache(cacheKey, results, 2 * 60 * 1000);
    return sendJson(res, 200, {
      ok: true,
      cached: false,
      mode,
      query: queryText,
      limit,
      count: results.length,
      results
    });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Pencarian gagal: " + (err.message || "Upstream error")
    });
  }
};
