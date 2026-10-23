"use strict";
/*
 * Keeps the sitemaps and search engines in step with removed pages, automatically (no admin action):
 *   - every few hours it lists every URL the 4 sitemaps contain (static pages, library documents, citation documents, Q&A);
 *   - a URL that was listed before and is gone now (page deleted, hidden, no-indexed) is marked "gone", the sitemap cache is cleared,
 *     and search engines are told through IndexNow (needs INDEXNOW_KEY); the page itself already answers with the 404 page;
 *   - the "gone" record is forgotten 24 hours later.
 * The XML sitemaps are read live from the database (60 s cache at most), so a removed page leaves the XML at once.
 */
const { query } = require("../config/database");
const EVERY = Math.max(10, parseInt(process.env.SITEMAP_SWEEP_MINUTES, 10) || 720) * 60 * 1000;
let busy = false;

async function ensure() {
  await query("CREATE TABLE IF NOT EXISTS sitemap_seen (url TEXT PRIMARY KEY, kind TEXT, last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), gone_at TIMESTAMPTZ)");
}
function origin() {
  const e = String(process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  return e || (process.env.RAILWAY_PUBLIC_DOMAIN ? "https://" + process.env.RAILWAY_PUBLIC_DOMAIN : "");
}
async function run() {
  if (busy) return; busy = true;
  try {
    const o = origin(); if (!o) return;
    const sm = require("./sitemapService");
    await ensure();
    const started = new Date(), list = await sm.allUrls(o);
    for (let i = 0; i < list.length; i += 5000) {
      const part = list.slice(i, i + 5000);
      await query("INSERT INTO sitemap_seen(url,kind,last_seen) SELECT t.u,t.k,$3::timestamptz FROM unnest($1::text[],$2::text[]) AS t(u,k) ON CONFLICT (url) DO UPDATE SET last_seen=$3::timestamptz, gone_at=NULL, kind=EXCLUDED.kind",
        [part.map((x) => x[0]), part.map((x) => x[1]), started]);
    }
    const gone = (await query("UPDATE sitemap_seen SET gone_at=NOW() WHERE last_seen < $1 AND gone_at IS NULL RETURNING url", [started])).rows.map((r) => r.url);
    await query("DELETE FROM sitemap_seen WHERE gone_at IS NOT NULL AND gone_at < NOW() - INTERVAL '24 hours'");
    sm.clearCache();
    if (gone.length) {
      console.log(`[SITEMAP] ${gone.length} removed page(s) left the sitemaps`);
      const Q = require("./qaService"), host = new URL(o).host;
      for (let i = 0; i < gone.length; i += 100) await Q.indexNow(gone.slice(i, i + 100), host);
    }
  } catch (e) { console.warn("[SITEMAP] sweep:", e.message); }
  finally { busy = false; }
}
function start() { setTimeout(run, 90 * 1000).unref(); setInterval(run, EVERY).unref(); }
module.exports = { start, run };
