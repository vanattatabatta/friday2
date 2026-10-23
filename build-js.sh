#!/bin/sh
# Readable sources live in src-js/. Edit them there, then run:  sh build-js.sh
# (needs esbuild:  npm i -g esbuild   or   npx esbuild). Writes the minified files to js/ and
# refreshes the precompressed .gz/.br copies the server serves.
set -e
cd "$(dirname "$0")"
for f in src-js/*.js; do
  b=$(basename "$f")
  npx --yes esbuild "$f" --minify --target=es2018 --legal-comments=none --outfile="js/$b" --log-level=warning
done
node compress-assets.js
