# Cloudflare CDN in front of the site (free plan)

Cloudflare needs no credentials in the app. It sits in front of your domain.

1. Add your domain at cloudflare.com (Add a site > Free). Change the nameservers at your domain registrar to the two Cloudflare gives you.
2. DNS: point the site's record (CNAME or A) at your web host and switch the cloud icon to "Proxied" (orange).
3. SSL/TLS > Overview: set mode to "Full (strict)". Edge Certificates: "Always Use HTTPS" ON.
4. Speed > Optimization: Brotli ON, HTTP/2 and HTTP/3 ON. Keep Rocket Loader OFF and Auto Minify OFF (they can break the site scripts).
5. Caching > Cache Rules (public pages only; the app already sends `Cache-Control` headers and marks user pages `no-store`):
   - Rule 1 "Static files": URI Path starts with /css/ or /js/ or /img/ or /webfonts/  ->  Eligible for cache, Edge TTL: respect origin.
   - Rule 2 "Public pages": Hostname equals YOUR-DOMAIN AND URI Path does NOT start with /api, /admin, /account, /agent, /login, /signup
     ->  Eligible for cache, Edge TTL: respect origin headers (the app sends max-age=300 on public pages).
   - Never cache /api/*, /admin/*, /account*, /agent*, login/signup pages.
6. Put the web host and the Aiven database in the same region, close to your visitors.
7. Test: open a public page twice and check the response header `cf-cache-status` (HIT on the second load). Check that logging in still works.
