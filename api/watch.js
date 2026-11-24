"use strict";

const sokuja = require("../lib/sokuja");
const { getQuery, sendJson, getCache, setCache } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const input = String(q.slug || q.id || "").trim();
  const only = (q.only || "full").toLowerCase(); // full | episode | mirrors | playlist
  const refresh = q.refresh === "1" || q.refresh === "true";

  if (!input) {
    return sendJson(res, 400, { ok: false, error: "Parameter slug atau episodeId wajib diisi." });
  }

  const slug = sokuja.getSlug(input);

  try {
    if (only === "mirrors") {
      const mirrors = await sokuja.getMirrors(slug);
      return sendJson(res, 200, { ok: true, data: mirrors });
    }

    if (only === "episode") {
      const ep = await sokuja.getEpisode(slug);
      return sendJson(res, 200, { ok: true, data: ep });
    }

    if (only === "playlist") {
      const playlist = await sokuja.getPlaylist(slug);
      return sendJson(res, 200, { ok: true, data: playlist });
    }

    const cacheKey = `watch:${slug}`;
    if (!refresh) {
      const cached = getCache(cacheKey);
      if (cached) return sendJson(res, 200, { ok: true, cached: true, data: cached });
    }

    const video = await sokuja.getVideo(slug);
    let playlist = { currentSlug: video.slug || slug, episodes: [] };
    if (video.slug) {
      try {
        playlist = await sokuja.getPlaylist(video.slug);
      } catch (e) {
        playlist = { currentSlug: video.slug, episodes: [] };
      }
    }

    const payload = { video, playlist };
    setCache(cacheKey, payload, 2 * 60 * 1000);
    return sendJson(res, 200, { ok: true, cached: false, data: payload });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Gagal memuat video episode: " + (err.message || "Upstream error")
    });
  }
};
