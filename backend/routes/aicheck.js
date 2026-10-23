"use strict";
const express = require("express");
const multer = require("multer");
const { analyze } = require("../services/aiDetectService");
const { requireUser } = require("../middleware/userAuth");

const router = express.Router();
router.use(express.json({ limit: "200kb" }));


/* per-IP limiter (each check may cost an LLM call): 12 checks / 10 min */
const makeLimit = (max) => {
  const hits = new Map();
  setInterval(() => hits.clear(), 3600 * 1000).unref();
  return (req, res, next) => {
    const now = Date.now(), arr = (hits.get(req.ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (arr.length >= max) return res.status(429).json({ success: false, message: "Too many requests. Please wait a few minutes and try again." });
    arr.push(now); hits.set(req.ip, arr); next();
  };
};
const limit = makeLimit(12);

const wc = (s) => (String(s).match(/\S+/g) || []).length;

/* Upload a file instead of pasting: .txt .md .docx .pdf are turned into plain text and returned to the page (nothing is stored). */
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1048576, files: 1 } });
const tidyText = (t) => String(t || "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
router.post("/extract", requireUser, limit, (req, res) => {
  fileUpload.single("file")(req, res, async (err) => {
    res.set("Cache-Control", "no-store");
    if (err) return res.status(400).json({ success: false, message: err.code === "LIMIT_FILE_SIZE" ? "That file is over 10 MB." : "Couldn't read that file." });
    const f = req.file;
    if (!f) return res.status(400).json({ success: false, message: "Choose a file first." });
    const name = String(f.originalname || "file"), ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1];
    try {
      let text = "";
      switch (String(ext || "").toLowerCase()) {
        case "txt": case "md": case "markdown": case "text": text = f.buffer.toString("utf8"); break;
        case "docx": text = (await require("mammoth").extractRawText({ buffer: f.buffer })).value; break;
        case "pdf": text = (await require("pdf-parse")(f.buffer)).text; break;
        default: return res.status(400).json({ success: false, message: "Please upload a .txt, .docx or .pdf file." });
      }
      text = tidyText(text);
      if (!text) return res.status(422).json({ success: false, message: "No readable text was found in that file (a scanned PDF has no text layer). Paste the text instead." });
      res.json({ success: true, name, text: text.slice(0, 60000), words: wc(text), truncated: text.length > 60000 });
    } catch (e) {
      console.warn("[AICHECK] extract:", e.message);
      res.status(422).json({ success: false, message: "That file couldn't be read. Try another file or paste the text." });
    }
  });
});

router.post("/", requireUser, limit, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, ...(await analyze(req.body && req.body.text)) });
  } catch (e) {
    if (!e.status) console.error("[AICHECK]", e);
    res.status(e.status || 500).json({ success: false, message: e.status ? e.message : "The detector is unavailable right now." });
  }
});

module.exports = router;
