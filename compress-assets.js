// Rebuilds the .gz and .br copies of js/*.js, css/*.css and index.html (the server only uses a copy that is newer than its source).
const fs = require("fs"), zlib = require("zlib"), path = require("path");
const list = [];
for (const d of ["js", "css"]) for (const f of fs.readdirSync(path.join(__dirname, d)))
  if (/\.(js|css)$/.test(f) && !/\.min\./.test(f)) list.push(path.join(__dirname, d, f));
list.push(path.join(__dirname, "index.html"));
for (const f of list) {
  const b = fs.readFileSync(f);
  fs.writeFileSync(f + ".gz", zlib.gzipSync(b, { level: 9 }));
  fs.writeFileSync(f + ".br", zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } }));
}
console.log("compressed", list.length, "files");
