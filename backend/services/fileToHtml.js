"use strict";
/*
 * Any uploaded file -> one clean, self-contained HTML page (used by Admin > Static pages).
 *   .html .htm            kept as they are
 *   .docx                 mammoth (headings, lists, tables, images embedded)
 *   .doc .rtf .odt        LibreOffice -> .docx -> mammoth
 *   .xlsx .xls .ods .csv .tsv   one HTML table per sheet
 *   .pdf                  text extracted page by page (pdf-parse) -> headings + paragraphs
 *   .txt .md .log         paragraphs
 */
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const strip = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(String(n || "")) || [, ""])[1].toLowerCase();

const CSS = "body{font:17px/1.7 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;max-width:860px;margin:0 auto;padding:28px 18px}h1,h2,h3{line-height:1.25;color:#111827}img{max-width:100%;height:auto}"
  + "table{border-collapse:collapse;max-width:100%;display:block;overflow-x:auto;margin:1em 0}td,th{border:1px solid #d1d5db;padding:6px 10px;text-align:left}th{background:#f3f4f6}a{color:#0f766e}";

function wrap(title, description, body) {
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(title)}</title>\n`
    + (description ? `<meta name="description" content="${esc(description)}">\n` : "")
    + `<style>${CSS}</style>\n</head>\n<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`;
}
const nameTitle = (f) => String(f || "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

/* finish: pick title/description, make sure there is exactly one <h1> */
function finish(body, filename) {
  if (strip(body).length < 20 && !/<img/i.test(body)) throw err("No text was found in this file.", 422);
  const h = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(body);
  const title = (h ? strip(h[1]) : nameTitle(filename)).slice(0, 300) || "Document";
  if (!/<h1[\s>]/i.test(body)) body = `<h1>${esc(title)}</h1>\n` + body;
  const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(body.replace(/<h1[\s\S]*?<\/h1>/i, ""));
  const description = p ? strip(p[1]).slice(0, 155) : "";
  body = body.replace(/<img /gi, `<img loading="lazy" alt="${esc(title)}" `);
  return { html: wrap(title, description, body), title, description };
}

const paragraphs = (text) => String(text).replace(/\r/g, "").split(/\n{2,}/).map((b) => b.replace(/\n+/g, " ").trim()).filter(Boolean);

/* ---------- Word ---------- */
async function docxToBody(buffer) {
  let mammoth; try { mammoth = require("mammoth"); } catch { throw err("The converter is not installed. Run: npm install mammoth", 500); }
  try { return (await mammoth.convertToHtml({ buffer }, { styleMap: ["p[style-name='Title'] => h1.title:fresh"] })).value || ""; }
  catch { throw err("This file could not be read as a Word document. Re-save it as .docx and try again."); }
}
/* ---------- LibreOffice (doc, rtf, odt, xls, ods) ---------- */
let office = Promise.resolve();
function soffice(buffer, ext, target) {
  const job = office.then(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "h2-"));
    try {
      const src = path.join(dir, "in." + ext);
      await fs.writeFile(src, buffer);
      await new Promise((res, rej) => execFile(process.env.SOFFICE_BIN || "soffice", ["--headless", "--norestore", "-env:UserInstallation=file://" + dir + "/profile", "--convert-to", target, "--outdir", dir, src], { timeout: 150000 }, (e) => (e ? rej(e) : res())));
      return await fs.readFile(path.join(dir, "in." + target));
    } catch (e) {
      if (e && e.code === "ENOENT") throw err(`.${ext} files need LibreOffice on the server. Save the file as .docx / .xlsx / .pdf and upload that.`, 415);
      throw err("The file could not be converted. Save it as .docx / .xlsx / .pdf and try again.", 422);
    } finally { fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  });
  office = job.catch(() => {});
  return job;
}
/* ---------- spreadsheets / csv ---------- */
function table(rows) {
  const w = Math.max(0, ...rows.map((r) => r.length)); if (!w) return "";
  const cell = (v, t) => `<${t}>${esc(v)}</${t}>`;
  const [head, ...rest] = rows;
  return `<table><thead><tr>${Array.from({ length: w }, (_, i) => cell(head[i] ?? "", "th")).join("")}</tr></thead><tbody>${rest.map((r) => `<tr>${Array.from({ length: w }, (_, i) => cell(r[i] ?? "", "td")).join("")}</tr>`).join("")}</tbody></table>`;
}
function csvRows(text, sep) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim()));
}
function sheetsToBody(buffer, filename) {
  let X; try { X = require("xlsx"); } catch { throw err("Excel support needs: npm install xlsx", 500); }
  const wb = X.read(buffer, { type: "buffer" });
  const parts = wb.SheetNames.map((n) => { const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: false }).filter((r) => r.some((v) => String(v).trim())); return rows.length ? (wb.SheetNames.length > 1 ? `<h2>${esc(n)}</h2>` : "") + table(rows) : ""; });
  return `<h1>${esc(nameTitle(filename))}</h1>\n` + parts.join("\n");
}
/* ---------- PDF ---------- */
async function pdfToBody(buffer, filename) {
  const pages = [];
  try {
    await require("pdf-parse")(buffer, { pagerender: async (pd) => {
      const tc = await pd.getTextContent(); let t = "", y;
      for (const it of tc.items) { if (!it.str) { if (it.hasEOL) t += "\n"; continue; } if (y !== undefined && Math.abs(y - it.transform[5]) > 2) t += "\n"; t += it.str; y = it.transform[5]; }
      pages.push(t); return t; } });
  } catch { throw err("This PDF could not be read."); }
  const out = [];
  for (const pg of pages) {
    let para = "";
    const flush = () => { if (para.trim()) out.push(`<p>${esc(para.trim())}</p>`); para = ""; };
    for (const raw of pg.replace(/\r/g, "").split("\n")) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      if (line.length <= 70 && !/[.,;:!?)"”]$/.test(line) && /^[A-Z0-9]/.test(line) && !para) { out.push(`<h2>${esc(line)}</h2>`); continue; }   /* short line without final punctuation = heading */
      para += (para && !/-$/.test(para) ? " " : "") + line.replace(/-$/, "-");
      if (/[.!?]["”)]?$/.test(line) && line.length < 60) flush();
    }
    flush();
  }
  if (!out.length) throw err("This PDF has no selectable text (it looks scanned). Upload a text PDF or a .docx.", 422);
  return `<h1>${esc(nameTitle(filename))}</h1>\n` + out.join("\n");
}

/* ---------- entry point ---------- */
async function convertFile(buffer, filename) {
  const ext = extOf(filename);
  if (!buffer || !buffer.length) throw err("The file is empty.");
  switch (ext) {
    case "html": case "htm": {
      if (buffer.subarray(0, 2000).includes(0)) throw err("That file is not text/HTML.");
      const html = buffer.toString("utf8").replace(/^\uFEFF/, "").replace(/\u0000/g, "");
      const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html), d = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html);
      return { html, title: t ? strip(t[1]).slice(0, 300) : nameTitle(filename), description: d ? d[1].trim().slice(0, 400) : "" };
    }
    case "docx": return finish(await docxToBody(buffer), filename);
    case "doc": case "rtf": case "odt": return finish(await docxToBody(await soffice(buffer, ext, "docx")), filename);
    case "xlsx": case "ods": case "csv": case "tsv": case "xls":
      if (ext === "csv" || ext === "tsv") return finish(`<h1>${esc(nameTitle(filename))}</h1>\n` + table(csvRows(buffer.toString("utf8").replace(/^\uFEFF/, ""), ext === "tsv" ? "\t" : ",")), filename);
      return finish(sheetsToBody(buffer, filename), filename);
    case "pdf": return finish(await pdfToBody(buffer, filename), filename);
    case "txt": case "md": case "log": {
      const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
      if (text.includes("\u0000")) throw err("That file is not plain text.");
      return finish(paragraphs(text).map((p) => `<p>${esc(p)}</p>`).join("\n"), filename);
    }
    default: throw err(`".${ext || "?"}" files are not supported. Upload HTML, Word (.docx/.doc), PDF, Excel (.xlsx/.xls/.csv) or text (.txt).`, 415);
  }
}
module.exports = { convertFile, extOf };
