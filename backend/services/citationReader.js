"use strict";
/*
 * Reads the text of ANY uploaded file for the Citation Generator, whatever its type or page count.
 *
 *  - The type is detected from the file's first bytes (magic numbers) first and its extension second, so a wrongly named file still works.
 *  - PDFs go through poppler's `pdftotext` in a separate process: fast on hundreds of pages, low memory, and it never blocks the Node
 *    event loop (pdf-parse did, which made long PDFs stall the server and come back as a non-JSON proxy error). pdf-parse is only the fallback.
 *    Scanned PDFs (no text layer) fall back to OCR of the first pages when tesseract is installed.
 *  - Zip based formats (docx, pptx, odt, odp, ods, epub, pages-less zips) are read with a tiny built-in zip reader.
 *  - Images are read by OCR (tesseract), spreadsheets by SheetJS, HTML/RTF/plain text/code/JSON/XML/etc. directly.
 *  - Every step has a time limit and a fallback, so one bad file can never hang or crash the request.
 */
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFile } = require("child_process");

const MAX_CHARS = Number(process.env.CITATION_MAX_CHARS || 1500000);   /* text kept per file (plenty for picking keywords) */
const err = (message, status = 400) => Object.assign(new Error(message), { status });
const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(String(n || "")) || [, ""])[1].toLowerCase();

const run = (cmd, args, ms = 60000) => new Promise((res, rej) =>
  execFile(cmd, args, { timeout: ms, maxBuffer: 1 << 27, encoding: "utf8" }, (e, out) => (e ? rej(e) : res(out))));
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error((label || "step") + " timed out")), ms).unref())]);
const tidy = (t) => String(t || "").replace(/\r\n?/g, "\n").replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CHARS);
const ents = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g) => g[0] === "#" ? String.fromCodePoint(g[1].toLowerCase() === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : (ents[g.toLowerCase()] || " "));
const xmlText = (x) => decode(String(x).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(a:p|w:p|text:p|text:h|p|div|h[1-6]|li|tr|br|title)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "));

/* ---------- tiny zip reader (central directory + inflate) ---------- */
function zipEntries(buf) {
  const min = Math.max(0, buf.length - 65557);
  let i = buf.length - 22;
  for (; i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) break;
  if (i < min) return null;
  const total = buf.readUInt16LE(i + 10);
  let p = buf.readUInt32LE(i + 16);
  const out = [];
  for (let k = 0; k < total && p + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    out.push({ method: buf.readUInt16LE(p + 10), csize: buf.readUInt32LE(p + 20), usize: buf.readUInt32LE(p + 24), lho: buf.readUInt32LE(p + 42), name: buf.toString("utf8", p + 46, p + 46 + nl) });
    p += 46 + nl + el + cl;
  }
  return out;
}
function zipRead(buf, e) {
  const p = e.lho, start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28), data = buf.subarray(start, start + e.csize);
  return e.method === 0 ? data : zlib.inflateRawSync(data);
}
const SKIP = /(^|\/)(_rels|META-INF|docProps|theme|slideLayouts|slideMasters|notesMasters|customXml)\/|(styles|settings|fontTable|numbering|webSettings|\[Content_Types\]|manifest|container|toc|nav|content\.opf|mimetype)\b/i;
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

function zipText(buf) {
  const list = zipEntries(buf);
  if (!list) throw err("That file looks damaged or isn't a readable archive.", 422);
  let budget = 60 * 1048576, text = "";
  const names = list.filter((e) => /\.(xml|xhtml|html?|txt|md|csv)$/i.test(e.name) && !SKIP.test(e.name) && e.usize <= 30 * 1048576).sort((a, b) => natural(a.name, b.name));
  for (const e of names) {
    if (text.length > MAX_CHARS || (budget -= e.usize) < 0) break;
    try { text += "\n\n" + xmlText(zipRead(buf, e).toString("utf8")); } catch (_) { /* skip a bad entry */ }
  }
  return tidy(text);
}

/* ---------- other readers ---------- */
function looksText(buf) {
  const s = buf.subarray(0, 8000);
  if (!s.length) return false;
  if ((s[0] === 0xff && s[1] === 0xfe) || (s[0] === 0xfe && s[1] === 0xff)) return true;
  let bad = 0;
  for (const b of s) if (b === 0 || (b < 9) || (b > 13 && b < 32)) bad++;
  return bad / s.length < 0.02;
}
function decodeText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf).swap16().toString("utf16le");
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}
const rtfText = (r) => String(r).replace(/\{\\\*[^{}]*\}/g, " ").replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(par|line|tab)\b ?/g, "\n").replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, "").replace(/\\(.)/g, "$1");
function looseStrings(buf) {   /* legacy binary Office files (.doc/.ppt/.xls): pull out readable runs of text */
  const a = buf.toString("latin1").match(/[ -~]{8,}/g) || [], u = buf.toString("utf16le").match(/(?:[ -~]\u0000?){8,}/g) || [];
  return a.concat(u.map((x) => x.replace(/\u0000/g, ""))).filter((x) => /[a-z]{3}/i.test(x) && x.split(" ").length > 2).join("\n");
}

async function sheetText(buf) {
  const X = require("xlsx"), wb = X.read(buf, { cellDates: true });
  return tidy(wb.SheetNames.map((s) => X.utils.sheet_to_csv(wb.Sheets[s]).replace(/,+/g, " ")).join("\n\n"));
}

async function tmpdir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cite-"));
  try { return await fn(dir); } finally { fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
async function ocrFile(file) {
  const t = await run("tesseract", [file, "stdout", "-l", "eng", "--psm", "3"], 60000);
  return String(t || "");
}
async function imageText(buf) {
  return tmpdir(async (dir) => {
    const src = path.join(dir, "i.png");
    let out = buf;
    try { out = await require("sharp")(buf).rotate().resize({ width: 2200, withoutEnlargement: true }).grayscale().normalize().png().toBuffer(); } catch (_) { /* tesseract will try the raw bytes */ }
    await fs.writeFile(src, out);
    try { return tidy(await ocrFile(src)); }
    catch (e) { throw err(e.code === "ENOENT" ? "Reading text from images isn't available on this server." : "No readable text was found in that image.", 422); }
  });
}

async function pdfText(buf) {
  return tmpdir(async (dir) => {
    const pdf = path.join(dir, "in.pdf");
    await fs.writeFile(pdf, buf);
    let text = "";
    /* 1. poppler: whole document, then (if that is too slow) the first 120 pages only */
    for (const last of [null, "120"]) {
      try { text = await run("pdftotext", ["-q", "-enc", "UTF-8", "-nopgbrk"].concat(last ? ["-l", last] : [], [pdf, "-"]), last ? 60000 : 75000); if (tidy(text).length >= 40) return tidy(text); break; }
      catch (e) { if (e.code === "ENOENT") break; if (!last) continue; break; }
    }
    /* 2. pdf-parse in-process (only if poppler is missing or found nothing) */
    try {
      const r = await withTimeout(require("pdf-parse")(buf, { max: 300 }), 45000, "pdf-parse");
      if (tidy(r.text).length >= 40) return tidy(r.text);
    } catch (e) { /* fall through to OCR */ }
    /* 3. scanned PDF: OCR the first pages */
    try {
      await run("pdftoppm", ["-r", "130", "-l", "8", "-png", pdf, path.join(dir, "p")], 90000);
      const pngs = (await fs.readdir(dir)).filter((f) => /^p.*\.png$/.test(f)).sort(natural);
      let ocr = "";
      for (const f of pngs) { try { ocr += "\n" + await ocrFile(path.join(dir, f)); } catch (e) { if (e.code === "ENOENT") break; } }
      if (tidy(ocr).length >= 40) return tidy(ocr);
    } catch (_) { /* nothing more to try */ }
    throw err("No readable text was found in that PDF (it may be scanned images or password protected).", 422);
  });
}

async function officeConvert(buf, name) {
  const html = (await require("./fileToHtml").convertFile(buf, name)).html;
  return tidy(xmlText(html));
}

/* ---------- type detection ---------- */
function sniff(buf, name) {
  const ext = extOf(name), h = buf.subarray(0, 8);
  if (h.subarray(0, 4).toString("latin1") === "%PDF" || buf.subarray(0, 1024).toString("latin1").includes("%PDF-")) return "pdf";
  if (h[0] === 0x50 && h[1] === 0x4b) return ext === "xlsx" || ext === "xlsm" || ext === "xlsb" ? "sheet" : ext === "docx" || ext === "docm" ? "docx" : "zip";
  if (h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0) return ext === "xls" ? "sheet" : ext === "doc" || ext === "rtf" ? "convert" : "ole";
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e) return "image";
  if (h[0] === 0xff && h[1] === 0xd8) return "image";
  if (h.subarray(0, 3).toString() === "GIF" || h.subarray(0, 2).toString() === "BM" || (h.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") || (h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a) || (h[0] === 0x4d && h[1] === 0x4d && h[3] === 0x2a)) return "image";
  if (buf.subarray(0, 5).toString() === "{\\rtf") return "rtf";
  if (/^(ods|xls|xlsx|csv|tsv)$/.test(ext) && !looksText(buf)) return "sheet";
  if (looksText(buf)) return /^(html?|xhtml|xml|svg)$/.test(ext) || /^\s*<(!doctype html|html|\?xml)/i.test(buf.subarray(0, 300).toString("utf8")) ? "markup" : "text";
  if (/^(jpe?g|png|gif|webp|bmp|tiff?)$/.test(ext)) return "image";
  return "unknown";
}

/* Returns the plain text of any file. Throws an Error with .status (415 unsupported, 422 nothing readable) when it can't. */
async function readAny(file) {
  const buf = file.buffer, name = String(file.originalname || "");
  if (!buf || !buf.length) throw err("That file is empty.", 422);
  const kind = sniff(buf, name);
  switch (kind) {
    case "pdf": return pdfText(buf);
    case "image": return imageText(buf);
    case "docx":
      try { const t = tidy((await require("mammoth").extractRawText({ buffer: buf })).value); if (t.length >= 40) return t; } catch (_) { /* fall back below */ }
      return zipText(buf);
    case "zip": return zipText(buf);   /* pptx, odt, odp, ods, epub and any other zipped document */
    case "sheet": try { return await sheetText(buf); } catch (e) { if (extOf(name) === "ods") return zipText(buf); throw err("That spreadsheet couldn't be read.", 422); }
    case "convert":
      try { return await officeConvert(buf, name); } catch (_) { return tidy(looseStrings(buf)); }
    case "ole": return tidy(looseStrings(buf));
    case "rtf":
      try { return await officeConvert(buf, /\.rtf$/i.test(name) ? name : name + ".rtf"); } catch (_) { return tidy(rtfText(buf.toString("latin1"))); }
    case "markup": return tidy(xmlText(decodeText(buf)));
    case "text": return tidy(decodeText(buf));
    default: throw err(`"${name}" isn't a file type we can read text from.`, 415);
  }
}

module.exports = { readAny, sniff };
