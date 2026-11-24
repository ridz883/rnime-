"use strict";

const sokuja = require("../lib/sokuja");
const { getQuery, sendJson, getCache, setCache } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const input = String(q.slug || q.input || "").trim();
  const only = (q.only || "full").toLowerCase(); // full | episodes
  const refresh = q.refresh === "1" || q.refresh === "true";

  if (!input) {
    return sendJson(res, 400, { ok: false, error: "Parameter slug atau URL anime wajib diisi." });
  }

  const slug = sokuja.pathSlug(input);
  const cacheKey = `anime:${only}:${slug}`;

  if (!refresh) {
    const cached = getCache(cacheKey);
    if (cached) return sendJson(res, 200, { ok: true, cached: true, data: cached });
  }

  try {
    const data = only === "episodes"
      ? { slug, episodes: await sokuja.getEpisodes(slug) }
      : await sokuja.getAnime(slug);

    setCache(cacheKey, data, 5 * 60 * 1000);
    return sendJson(res, 200, { ok: true, cached: false, data });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Gagal mengambil detail anime: " + (err.message || "Upstream error")
    });
  }
};
