const jwt = require("jsonwebtoken");
const { query } = require("../config/database");

/*
 * Admin-only guard.
 * The role check matters: other tokens in this app (the paid-subscriber cookie,
 * customer sessions) are signed with related secrets, and none of them may ever
 * open the admin API.
 *
 * Accounts live in admin_users and have a role:
 *   main     the first admin; creates / edits / deletes the others (exactly one)
 *   admin    everything except managing other admin accounts
 *   manager  orders (submissions), live chat and visitors only  -> MANAGER_ALLOWED below
 * The account is re-checked in the database (cached 15 s), so deactivating or deleting an
 * admin takes effect at once instead of when their 12-hour token expires.
 */
const MANAGER_ALLOWED = ["/api/submissions", "/api/admin/me", "/api/admin/change-password", "/api/admin/online"];
const CHANGE_PW_ALLOWED = ["/api/admin/me", "/api/admin/change-password"];   // while "must change password" is set

const cache = new Map();   // id -> { t, row }
function clearAdminCache(id) { if (id === undefined) cache.clear(); else cache.delete(String(id)); }

async function adminState(id) {
  const k = String(id), hit = cache.get(k);
  if (hit && Date.now() - hit.t < 15000) return hit.row;
  const r = await query("SELECT id,username,email,role,is_active,must_change_password FROM admin_users WHERE id=$1", [id]);
  const row = r.rows[0] || null;
  cache.set(k, { t: Date.now(), row });
  return row;
}

async function requireAdmin(req, res, next) {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  if (!token) return res.status(401).json({ success: false, message: "Login required." });
  if (!process.env.JWT_SECRET) return res.status(500).json({ success: false, message: "JWT_SECRET is not configured." });
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
  }
  if (!claims || claims.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required." });
  }
  try {
    const row = await adminState(claims.id);
    if (!row || !row.is_active) return res.status(401).json({ success: false, message: "This admin account is disabled or was removed." });
    const full = (req.baseUrl || "") + (req.path || "");
    const under = (list) => list.some((p) => full === p || full.startsWith(p + "/"));
    if (row.must_change_password && !under(CHANGE_PW_ALLOWED)) {
      return res.status(403).json({ success: false, code: "MUST_CHANGE_PASSWORD", message: "Please change your password first." });
    }
    if (row.role === "manager" && !under(MANAGER_ALLOWED)) {
      return res.status(403).json({ success: false, message: "Your manager account cannot use this tool." });
    }
    req.admin = { ...claims, adminRole: row.role, email: row.email || "", mustChange: !!row.must_change_password };
    next();
  } catch (e) {
    console.error("[ADMIN AUTH]", e.message);
    res.status(500).json({ success: false, message: "Could not verify the admin account." });
  }
}

function requireMainAdmin(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.adminRole !== "main") return res.status(403).json({ success: false, message: "Only the main admin can manage admin accounts." });
    next();
  });
}

module.exports = { requireAdmin, requireMainAdmin, clearAdminCache, adminState };
