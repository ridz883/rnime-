"use strict";

const memoryCache = new Map();

function getQuery(req) {
  if (req && req.query && typeof req.query === "object") {
    return req.query;
  }
  try {
    const parsed = new URL(req.url || "/", "http://localhost");
    return Object.fromEntries(parsed.searchParams.entries());
  } catch (e) {
    return {};
  }
}

function sendJson(res, statusCode, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(statusCode).json(payload);
  }
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function getCache(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache(key, value, ttlMs) {
  if (memoryCache.size > 200) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(key, {
    value: value,
    expiresAt: Date.now() + ttlMs
  });
}

module.exports = { getQuery, sendJson, getCache, setCache };
