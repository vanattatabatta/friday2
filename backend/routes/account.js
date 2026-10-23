"use strict";

const express = require("express");
const c = require("../controllers/accountController");
const { requireUser, clearSession } = require("../middleware/userAuth");
const store = require("../services/userStore");

const router = express.Router();
router.use(requireUser);

/* Self-service account controls. The user must type the word to confirm. */
router.post("/suspend", async (req, res) => {
  try {
    if (String((req.body || {}).confirm || "").toUpperCase() !== "SUSPEND") return res.status(400).json({ success: false, message: "Type SUSPEND to confirm." });
    await store.setStatus(req.user.id, "suspended");
    clearSession(req, res);
    res.json({ success: true, message: "Your account is suspended. Log in any time to reactivate it." });
  } catch (e) { console.error("[ACCOUNT] suspend:", e.message); res.status(500).json({ success: false, message: "Could not suspend the account." }); }
});
router.delete("/me", async (req, res) => {
  try {
    if (String((req.body || {}).confirm || "").toUpperCase() !== "DELETE") return res.status(400).json({ success: false, message: "Type DELETE to confirm." });
    await store.deleteUser(req.user.id);
    clearSession(req, res);
    res.json({ success: true, message: "Your account has been deleted." });
  } catch (e) { console.error("[ACCOUNT] delete:", e.message); res.status(500).json({ success: false, message: "Could not delete the account." }); }
});

router.get("/overview", c.overview);
router.get("/me", c.me);
router.patch("/me", c.updateMe);
router.get("/subscription", c.subscription);
router.post("/subscription/cancel", c.cancelSubscription);
router.post("/subscription/resume", c.resumeSubscription);
router.get("/transactions", c.transactions);
router.get("/orders", c.orders);
router.get("/orders/:orderId", c.orderDetail);
router.get("/orders/:orderId/files/:fileId", c.orderFile);

module.exports = router;
