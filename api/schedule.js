"use strict";

const sokuja = require("../lib/sokuja");
const { getQuery, sendJson, getCache, setCache } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const refresh = q.refresh === "1" || q.refresh === "true";
  const cacheKey = "schedule:all";

  if (!refresh) {
    const cached = getCache(cacheKey);
    if (cached) return sendJson(res, 200, { ok: true, cached: true, data: cached });
  }

  try {
    const data = await sokuja.getSchedule();
    setCache(cacheKey, data, 15 * 60 * 1000);
    return sendJson(res, 200, { ok: true, cached: false, data });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Gagal memuat jadwal rilis: " + (err.message || "Upstream error")
    });
  }
};
