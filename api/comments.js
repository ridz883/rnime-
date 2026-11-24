"use strict";

const sokuja = require("../lib/sokuja");
const { getQuery, sendJson } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const episodeId = q.episodeId || q.id;
  const limit = Math.min(50, Math.max(1, parseInt(q.limit, 10) || 10));
  const cursor = q.cursor != null && q.cursor !== "" ? q.cursor : undefined;

  if (!episodeId) {
    return sendJson(res, 400, { ok: false, error: "Parameter episodeId wajib diisi." });
  }

  try {
    const data = await sokuja.getComments(episodeId, { limit, cursor });
    return sendJson(res, 200, { ok: true, data });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Gagal memuat komentar: " + (err.message || "Upstream error")
    });
  }
};
