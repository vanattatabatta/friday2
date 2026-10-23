
const crypto = require("crypto");
const path = require("path");
const { pool, query } = require("../config/database");
const {
  sendSubmissionEmail,
  isConfigured,
  EMAIL_TO
} = require("../services/emailService");

const IST = "Asia/Kolkata";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function safeName(name) {
  return (
    path
      .basename(String(name || "file"))
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .slice(0, 500) || "file"
  );
}

function istParts(when) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(when || new Date());

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [key, Number(value)])
  );
}

/*
 * Order ID format: AH + YY + MM + DD + HH + mm  (IST, 12 characters)
 * Example: 2 Oct 2026, 15:12 IST -> AH2610021512
 *
 * IDs are minute-based, so a second order in the same minute moves to the
 * next free minute (AH2610021513) instead of failing. The offset is applied
 * to the timestamp, so the ID always keeps the same 12-character format.
 */
function createOrderId(offsetMinutes = 0, kind = "ah") {
  const date = istParts(new Date(Date.now() + offsetMinutes * 60000));
  const two = (n) => String(n).padStart(2, "0");
  const yy = String(date.year).slice(-2);

  /* AI to Human Expert orders: AI + DD + MM + YY + HH + mm (12 characters)
     Example: 23 Oct 2026, 15:12 IST -> AI2310261512 */
  if (kind === "ai") {
    return `AI${two(date.day)}${two(date.month)}${yy}${two(date.hour)}${two(date.minute)}`;
  }

  return `AH${yy}${two(date.month)}${two(date.day)}${two(date.hour)}${two(date.minute)}`;
}

async function newOrderId(client, kind = "ah") {
  for (let offset = 0; offset < 240; offset++) {
    const orderId = createOrderId(offset, kind);

    const result = await client.query(
      "SELECT 1 FROM submissions WHERE order_id=$1 LIMIT 1",
      [orderId]
    );

    if (!result.rows.length) {
      return orderId;
    }
  }

  throw new Error("Could not create a unique order ID.");
}

function validDate(value) {
  const stringValue = String(value || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return false;
  }

  const [year, month, day] = stringValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validHour(value) {
  if (!/^\d{2}:00$/.test(String(value || ""))) {
    return false;
  }

  const hour = Number(String(value).slice(0, 2));

  return hour >= 0 && hour <= 23;
}

function validateDeadline(date, time) {
  date = String(date || "").trim();
  time = String(time || "").trim();

  if (!validDate(date)) {
    return {
      valid: false,
      message: "Invalid deadline date."
    };
  }

  if (!validHour(time)) {
    return {
      valid: false,
      message: "Invalid deadline hour. Use HH:00."
    };
  }

  const now = istParts();

  const today = `${now.year}-${String(now.month).padStart(
    2,
    "0"
  )}-${String(now.day).padStart(2, "0")}`;

  if (date < today) {
    return {
      valid: false,
      message: "Deadline cannot be in the past."
    };
  }

  if (date === today && Number(time.slice(0, 2)) <= now.hour) {
    return {
      valid: false,
      message: "Please select a future hour in IST."
    };
  }

  return {
    valid: true
  };
}

function formatDeadline(date, time) {
  try {
    if (!date) return "";

    const dateString =
      date instanceof Date
        ? `${date.getUTCFullYear()}-${String(
            date.getUTCMonth() + 1
          ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
        : String(date).slice(0, 10);

    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return String(date);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return String(date);
    }

    const hourMatch = /^\d{1,2}/.exec(String(time || ""));
    const hour = hourMatch
      ? String(Number(hourMatch[0])).padStart(2, "0")
      : "00";

    return `${String(day).padStart(2, "0")} ${
      MONTHS[month - 1]
    } ${year} ${hour}:00 IST`;
  } catch {
    return String(date || "");
  }
}

/*
 * Gets the visitor IP from the request.
 *
 * Render and other reverse proxies may provide x-forwarded-for.
 * The first IP in that header is normally the original client IP.
 */
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  const ip = forwarded
    ? String(forwarded).split(",")[0].trim()
    : req.ip || req.socket?.remoteAddress || "";

  return String(ip)
    .replace(/^::ffff:/, "")
    .replace(/^::1$/, "127.0.0.1")
    .trim();
}

function publicIp(ip) {
  if (!ip) return false;

  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "0.0.0.0" ||
    ip === "localhost"
  ) {
    return false;
  }

  if (
    /^(10\.|192\.168\.|169\.254\.)/.test(ip) ||
    /^(fc|fd|fe80:)/i.test(ip)
  ) {
    return false;
  }

  const parts = ip.split(".").map(Number);

  if (
    parts.length === 4 &&
    parts[0] === 172 &&
    parts[1] >= 16 &&
    parts[1] <= 31
  ) {
    return false;
  }

  return true;
}

/* ---------------------------------------------------------------
 * Country detection
 * 1. CDN / proxy country header (instant, no API call)
 * 2. Several free IP-lookup providers, tried in order
 * The 2-letter ISO code is always stored so the admin panel can
 * show the flag. Name <-> code are derived from each other.
 * ------------------------------------------------------------- */
let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(["en"], { type: "region" });
} catch {
  regionNames = null;
}

function validCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && !["XX", "ZZ", "T1"].includes(code)
    ? code
    : "";
}

function codeToName(code) {
  try {
    return (regionNames && regionNames.of(code)) || code;
  } catch {
    return code;
  }
}

let nameToCodeMap = null;

function nameToCode(name) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted || !regionNames) return "";

  if (!nameToCodeMap) {
    nameToCodeMap = new Map();

    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        try {
          const label = regionNames.of(code);
          // First match wins, so "United Kingdom" stays GB (not the legacy "UK").
          if (label && label !== code && !nameToCodeMap.has(label.toLowerCase())) {
            nameToCodeMap.set(label.toLowerCase(), code);
          }
        } catch {}
      }
    }

    nameToCodeMap.set("usa", "US");
    nameToCodeMap.set("uk", "GB");
    nameToCodeMap.set("uae", "AE");
    nameToCodeMap.set("south korea", "KR");
  }

  return nameToCodeMap.get(wanted) || "";
}

function countryFromHeaders(req) {
  const value =
    req.headers["cf-ipcountry"] ||
    req.headers["x-vercel-ip-country"] ||
    req.headers["cloudfront-viewer-country"] ||
    req.headers["x-country-code"] ||
    req.headers["x-appengine-country"] ||
    "";

  const code = validCode(Array.isArray(value) ? value[0] : value);

  return code ? { name: codeToName(code), code } : null;
}

async function fetchJson(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

const GEO_PROVIDERS = [
  {
    name: "ipwho.is",
    url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code`,
    parse: (d) =>
      d && d.success !== false
        ? { name: d.country, code: d.country_code }
        : null
  },
  {
    name: "country.is",
    url: (ip) => `https://api.country.is/${encodeURIComponent(ip)}`,
    parse: (d) => (d && d.country ? { name: "", code: d.country } : null)
  },
  {
    name: "ipapi.co",
    url: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    parse: (d) =>
      d && !d.error
        ? { name: d.country_name, code: d.country_code || d.country }
        : null
  }
];

async function lookupCountry(ip) {
  if (!publicIp(ip)) {
    return { name: "Local / Unknown", code: "" };
  }

  for (const provider of GEO_PROVIDERS) {
    try {
      const data = await fetchJson(provider.url(ip));
      const found = provider.parse(data);
      const code = validCode(found && found.code);

      if (code) {
        return {
          name: String((found && found.name) || "").trim() || codeToName(code),
          code
        };
      }
    } catch (error) {
      console.warn(`[COUNTRY LOOKUP] ${provider.name} failed for ${ip}: ${error.message}`);
    }
  }

  return { name: "Unknown", code: "" };
}

async function lookupCountryWithRetry(ip, attempts = 3) {
  let result = { name: "Unknown", code: "" };

  for (let i = 0; i < attempts; i++) {
    result = await lookupCountry(ip);
    if (result.code || !publicIp(ip)) return result;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (i + 1)));
  }

  return result;
}

/*
 * Fills in the country for older rows that were saved as Pending/Unknown
 * or have a country name but no code. Runs in the background when the
 * admin loads the list, at most once a minute, 25 rows at a time.
 */
let backfillRunning = false;
let lastBackfill = 0;

async function backfillCountries() {
  if (backfillRunning || Date.now() - lastBackfill < 60000) return;

  backfillRunning = true;
  lastBackfill = Date.now();

  try {
    const rows = (
      await query(`
        SELECT id, client_ip, country
        FROM submissions
        WHERE (country_code IS NULL OR country_code = '')
          AND client_ip IS NOT NULL AND client_ip <> ''
        ORDER BY created_at DESC
        LIMIT 25
      `)
    ).rows;

    for (const row of rows) {
      let geo = null;
      const known = nameToCode(row.country);

      if (known) {
        geo = { name: row.country, code: known };
      } else if (publicIp(row.client_ip)) {
        geo = await lookupCountry(row.client_ip);
      }

      if (geo && geo.code) {
        await query(
          "UPDATE submissions SET country=$1, country_code=$2 WHERE id=$3",
          [geo.name, geo.code, row.id]
        );
      }
    }
  } catch (error) {
    console.error("[COUNTRY BACKFILL ERROR]", error.message);
  } finally {
    backfillRunning = false;
  }
}

function map(row) {
  return {
    SubmissionId: Number(row.id),
    Id: row.order_id || row.id,
    Type: /^AI/i.test(String(row.order_id || "")) ? "ai" : "expert",
    Name: row.name || "",
    Email: row.email || "",
    Phone: row.phone || "",
    Subject: row.subject || "",
    DeadlineDate: row.deadline_date
      ? String(row.deadline_date).slice(0, 10)
      : "",
    DeadlineTime: row.deadline_time
      ? String(row.deadline_time).slice(0, 5)
      : "",
    Deadline: formatDeadline(row.deadline_date, row.deadline_time),
    Country: row.country || "Unknown",
    CountryCode:
      validCode(row.country_code) || nameToCode(row.country) || "",
    ClientIP: row.client_ip || "",
    AssignmentDetails: row.assignment_details || "",
    Status: row.status || "New",
    CreatedAt: row.created_at || null,
    UpdatedAt: row.updated_at || null,
    AttachmentCount: Number(row.attachment_count || 0)
  };
}

async function createSubmission(req, res) {
  let {
    name,
    email,
    phone,
    subject,
    deadline_date,
    deadline_time,
    message
  } = req.body || {};

  /* Hire AI to Human Expert page: order ID starts with AI and the admin panel lists it under the "AI to Human" tab */
  const isAiToHuman = String((req.body || {}).form_type || "") === "ai_to_human";

  // receiveFiles() uses upload.array("assignmentFiles"), so req.files
  // is already the complete attachment array.
  const files = Array.isArray(req.files) ? req.files : [];

  /* Short mobile form: only email, mobile number and an attachment are sent.
     The other fields are filled with clear placeholders so the admin panel, e-mails and the account still work. */
  if (String((req.body || {}).quick || "") === "1") {
    const em = String(email || "").trim(), ph = String(phone || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    if (ph.replace(/\D/g, "").length < 7) return res.status(400).json({ success: false, message: "Please enter your mobile number." });
    const textOk = String((req.body || {}).textok || "") === "1" && String(message || "").trim().length >= 20;   /* Hire AI to Human Expert page: a pasted description is enough */
    if (!files.length && !textOk) return res.status(400).json({ success: false, message: "Please attach your expert file." });
    const tomorrow = new Date(Date.now() + 5.5 * 3600e3 + 86400e3).toISOString().slice(0, 10);
    name = em.split("@")[0];
    subject = String(subject || "").trim() || "Quick request (mobile)";
    const okD = /^\d{4}-\d{2}-\d{2}$/.test(String(deadline_date || "")), okT = /^([01]\d|2[0-3]):\d{2}$/.test(String(deadline_time || ""));
    const gaveDeadline = okD && okT;
    if (!gaveDeadline) { deadline_date = tomorrow; deadline_time = "18:00"; }
    const desc = String(message || "").trim();
    message = (desc ? desc + "\n\n" : "") + "(Short mobile form. " + (gaveDeadline ? "Student deadline: " + deadline_date + " " + deadline_time : "No deadline given, placeholder deadline " + tomorrow + " 18:00 IST") + ". Please read the attached file and contact the student.)";
  }

  if (
    !String(name || "").trim() ||
    !String(email || "").trim() ||
    !String(subject || "").trim() ||
    !deadline_date ||
    !deadline_time ||
    !String(message || "").trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "Please complete all required fields."
    });
  }

  const deadlineCheck = validateDeadline(deadline_date, deadline_time);

  if (!deadlineCheck.valid) {
    return res.status(400).json({
      success: false,
      message: deadlineCheck.message
    });
  }

  const ip = clientIp(req);

  // Do not block form submission while contacting the geolocation API.
  const headerGeo = countryFromHeaders(req);
  const initialCountry = headerGeo
    ? headerGeo.name
    : publicIp(ip)
      ? "Pending"
      : "Local / Unknown";
  const initialCountryCode = headerGeo ? headerGeo.code : null;

  console.log("[IP DEBUG]", {
    ip,
    forwardedFor: req.headers["x-forwarded-for"] || null,
    remoteAddress: req.socket?.remoteAddress || null
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Serialize ID generation so two simultaneous orders cannot pick the same ID.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('submissions_order_id'))");

    const orderId = await newOrderId(client, isAiToHuman ? "ai" : "ah");

    const result = await client.query(
      `
        INSERT INTO submissions
        (
          order_id,
          name,
          email,
          phone,
          subject,
          deadline_date,
          deadline_time,
          assignment_details,
          client_ip,
          country,
          country_code,
          status,
          user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'New',$12)
        RETURNING id, order_id
      `,
      [
        orderId,
        String(name).trim(),
        String(email).trim(),
        phone ? String(phone).trim() : null,
        String(subject).trim(),
        deadline_date,
        deadline_time,
        String(message).trim(),
        ip || null,
        initialCountry,
        initialCountryCode,
        req.user ? Number(req.user.id) : null
      ]
    );

    const submissionId = Number(result.rows[0].id);

    // Insert all attachments in one database query.
    if (files.length) {
      const values = [];
      const parameters = [];

      files.forEach((file, index) => {
        const originalName = safeName(file.originalname);
        const storedName = `${crypto.randomUUID()}-${originalName}`;
        const base = index * 7;

        values.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`
        );

        parameters.push(
          submissionId,
          originalName,
          storedName,
          `${submissionId}/${storedName}`,
          file.mimetype || "application/octet-stream",
          Number(file.size || file.buffer.length),
          file.buffer
        );
      });

      await client.query(
        `
          INSERT INTO submission_files
          (
            submission_id,
            original_file_name,
            stored_file_name,
            file_path,
            mime_type,
            file_size,
            data
          )
          VALUES ${values.join(",")}
        `,
        parameters
      );
    }

    await client.query("COMMIT");

    /*
     * Country lookup runs after the response-critical database work.
     * The result is written back to the same submission.
     */
    if (!headerGeo && publicIp(ip)) {
      setImmediate(async () => {
        const geo = await lookupCountryWithRetry(ip);

        try {
          await query(
            `
              UPDATE submissions
              SET country=$1, country_code=$2, updated_at=NOW()
              WHERE id=$3
            `,
            [geo.name, geo.code || null, submissionId]
          );

          console.log(
            `[COUNTRY UPDATE] Submission ${submissionId}: ${geo.name}${geo.code ? ` (${geo.code})` : ""}`
          );
        } catch (error) {
          console.error("[COUNTRY UPDATE ERROR]", error.message);
        }
      });
    }

    // Email remains outside the response path for faster submission.
    if (isConfigured()) {
      setImmediate(() => {
        sendSubmissionEmail({
          submissionId,
          orderId,
          fields: {
            name,
            email,
            phone,
            subject,
            deadline_date,
            deadline_time,
            message,
            country: initialCountry,
            clientIp: ip
          },
          files
        }).catch((error) => {
          console.error("Submission email error:", error.message);
        });
      });
    }

    return res.status(201).json({
      success: true,
      message: "Thanks! Your Requirements Was Submitted.",
      submissionId,
      orderId,
      deadline: formatDeadline(deadline_date, deadline_time),
      country: initialCountry,
      attachmentCount: files.length
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("CREATE SUBMISSION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save the submission."
    });
  } finally {
    client.release();
  }
}

async function listSubmissions(req, res) {
  try {
    const result = await query(`
      SELECT
        s.*,
        COUNT(f.id)::int AS attachment_count
      FROM submissions s
      LEFT JOIN submission_files f
        ON f.submission_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    res.json({
      success: true,
      submissions: result.rows.map(map)
    });

    backfillCountries();
    return;
  } catch (error) {
    console.error("LIST SUBMISSIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load submissions."
    });
  }
}

async function getSubmission(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission ID."
      });
    }

    const submission = await query(
      "SELECT * FROM submissions WHERE id=$1 LIMIT 1",
      [id]
    );

    if (!submission.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Submission not found."
      });
    }

    const files = await query(
      `
        SELECT
          id,
          original_file_name,
          mime_type,
          file_size,
          created_at
        FROM submission_files
        WHERE submission_id=$1
        ORDER BY id
      `,
      [id]
    );

    return res.json({
      success: true,
      submission: map(submission.rows[0]),
      attachments: files.rows.map((file) => ({
        Id: Number(file.id),
        OriginalFileName: file.original_file_name,
        MimeType: file.mime_type || "application/octet-stream",
        FileSize: Number(file.file_size || 0),
        CreatedAt: file.created_at,
        ViewUrl: `/api/submissions/attachments/${file.id}/view`,
        DownloadUrl: `/api/submissions/attachments/${file.id}/download`
      }))
    });
  } catch (error) {
    console.error("GET SUBMISSION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load submission."
    });
  }
}

async function sendAttachment(req, res, forceDownload = false) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).send("Invalid attachment ID.");
    }

    const result = await query(
      `
        SELECT original_file_name, mime_type, data
        FROM submission_files
        WHERE id=$1
        LIMIT 1
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).send("Attachment not found.");
    }

    const file = result.rows[0];

    if (!file.data || !file.data.length) {
      return res.status(404).send("Attachment data is empty.");
    }

    const fileName = safeName(file.original_file_name || "attachment");
    const mimeType = file.mime_type || "application/octet-stream";

    const download =
      forceDownload ||
      req.path.endsWith("/download") ||
      ["1", "true"].includes(
        String(req.query.download || "").toLowerCase()
      );

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private,no-store,max-age=0");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", file.data.length);
    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${fileName}"`
    );

    return res.end(file.data);
  } catch (error) {
    console.error("ATTACHMENT RETRIEVAL ERROR:", error);

    return res.status(500).send("Unable to retrieve attachment.");
  }
}

const viewAttachment = (req, res) =>
  sendAttachment(req, res, false);

const downloadAttachment = (req, res) =>
  sendAttachment(req, res, true);

async function updateStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "");

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission ID."
      });
    }

    if (!["New", "In Progress", "Completed", "Cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status."
      });
    }

    const result = await query(
      `
        UPDATE submissions
        SET status=$1, updated_at=NOW()
        WHERE id=$2
        RETURNING order_id, status
      `,
      [status, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Submission not found."
      });
    }

    return res.json({
      success: true,
      message: "Status updated.",
      orderId: result.rows[0].order_id,
      status: result.rows[0].status
    });
  } catch (error) {
    console.error("STATUS UPDATE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update status."
    });
  }
}

/* GET /api/submissions/geo : country of the visitor (for the phone country-code picker). CDN country headers first, then the same IP lookup the submissions use. */
const geoCache = new Map();
async function geoCountry(req, res) {
  res.set("Cache-Control", "private, max-age=3600");
  const h = req.headers;
  const hdr = String(h["cf-ipcountry"] || h["x-vercel-ip-country"] || h["cloudfront-viewer-country"] || h["x-appengine-country"] || h["x-country-code"] || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(hdr) && hdr !== "XX" && hdr !== "T1") return res.json({ success: true, code: hdr });
  const ip = clientIp(req);
  if (!publicIp(ip)) return res.json({ success: true, code: "" });
  if (geoCache.has(ip)) return res.json({ success: true, code: geoCache.get(ip) });
  try {
    const r = await lookupCountry(ip);
    if (geoCache.size > 5000) geoCache.clear();
    geoCache.set(ip, r.code || "");
    return res.json({ success: true, code: r.code || "" });
  } catch (e) {
    return res.json({ success: true, code: "" });
  }
}

module.exports = {
  geoCountry,
  createSubmission,
  listSubmissions,
  getSubmission,
  viewAttachment,
  downloadAttachment,
  getFile: downloadAttachment,
  updateStatus,
  EMAIL_TO
};