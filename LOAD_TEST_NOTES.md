# Capacity notes - 1 million visits a month

NOT load-tested in the build environment (no Docker/network there). These are estimates plus a test you can run yourself.

## The numbers
- 1,000,000 visits/month = ~33,000 a day = ~0.4 visits/second on average.
- With ~10 requests per visit (HTML + API calls; JS/CSS/fonts are cached or served pre-compressed) = ~4 requests/second average.
- Plan for peaks of 10-20x (exam season, Google crawl): 40-80 requests/second.
- A 2 vCPU / 4 GB server with the included PostgreSQL tuning (shared_buffers 512 MB, 100 connections, app pool 30) is the right size.

## What already protects you
- Library/static pages are served from the database as pre-built HTML, with gzip/brotli files for CSS/JS.
- Caddy compresses and terminates HTTPS; the website only sees plain HTTP.
- Docker log rotation (10 MB x 3) so logs cannot fill the disk.
- Backups run in a separate container, so a dump never slows the website process.

## Test it yourself (10 minutes, from your laptop or a second server, not the production box at peak)
```
npm i -g autocannon
autocannon -c 50 -d 60 https://yourdomain.com/
autocannon -c 50 -d 60 https://yourdomain.com/<a-real-library-document-url>
```
Good result: 0 errors/non-2xx, p99 latency under ~1 second. Watch the server while it runs:
`docker stats` (CPU/RAM) and `docker compose exec postgres psql -U aht -d aht -c "select count(*) from pg_stat_activity"` (connections, must stay below 100).

## If it is not enough
1. Cloudflare in front (free plan) for caching static files and crawler bursts: see CLOUDFLARE_CDN_SETUP.md.
2. Upgrade to 4 vCPU / 8 GB and raise `shared_buffers` to 2GB and `effective_cache_size` to 6GB in docker-compose.yml.
3. If the compressed dump grows past ~50 MB: `BACKUP_EVERY_MINUTES=15` or exclude noisy tables with `BACKUP_EXCLUDE_TABLE_DATA`.
