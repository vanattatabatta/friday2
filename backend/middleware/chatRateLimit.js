"use strict";

/*
Small dependency-free sliding-window rate limiter, scoped to the chat
endpoint. Keeps a request timestamp list per IP in memory - fine for a
single Railway instance; if this ever runs on multiple instances, swap
for a shared store (Redis) instead.
*/

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS = 15;

const hits = new Map();

function cleanup(now) {
  for (const [ip, timestamps] of hits) {
    const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
    if (fresh.length) hits.set(ip, fresh);
    else hits.delete(ip);
  }
}

let lastCleanup = 0;

function chatRateLimit(req, res, next) {
  const now = Date.now();
  if (now - lastCleanup > WINDOW_MS) {
    cleanup(now);
    lastCleanup = now;
  }

  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const timestamps = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: "Too many messages - please wait a few minutes and try again."
    });
  }

  timestamps.push(now);
  hits.set(ip, timestamps);
  next();
}

/* Separate, roomier limiter for document uploads: the uploader sends one request per file (up to 10 files at a time), so the 15-per-5-minutes chat limit would block it. */
const uHits = new Map(), U_MAX = Number(process.env.UPLOAD_MAX_REQUESTS || 1000);
function uploadRateLimit(req, res, next) {
  const now = Date.now(), ip = req.ip || req.connection?.remoteAddress || "unknown";
  const t = (uHits.get(ip) || []).filter((x) => now - x < WINDOW_MS);
  if (t.length >= U_MAX) return res.status(429).json({ success: false, message: "Too many uploads - please wait a few minutes and try again." });
  t.push(now); uHits.set(ip, t);
  if (uHits.size > 5000) for (const [k, v] of uHits) if (!v.some((x) => now - x < WINDOW_MS)) uHits.delete(k);
  next();
}

module.exports = { chatRateLimit, uploadRateLimit };
