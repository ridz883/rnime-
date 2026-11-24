"use strict";

const sokuja = require("../lib/sokuja");
const { getQuery, sendJson, getCache, setCache } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const refresh = q.refresh === "1" || q.refresh === "true";
  const cacheKey = `home:${page}`;

  if (!refresh) {
    const cached = getCache(cacheKey);
    if (cached) return sendJson(res, 200, { ok: true, cached: true, data: cached });
  }

  try {
    const data = await sokuja.getHome(page);
    setCache(cacheKey, data, 3 * 60 * 1000);
    return sendJson(res, 200, { ok: true, cached: false, data });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Gagal memuat beranda Sokuja: " + (err.message || "Upstream error")
    });
  }
};
