"use strict";
/* Shared "is this visitor on the paid $30/month plan?" check, used by the chat assistant and AI to Human Text. */
const usage = require("./usageService");
const billing = require("./billingService");
const store = require("./userStore");

async function isPro(req) {
  const claims = usage.readProClaims(req);
  if (claims && (await billing.subscriptionActive(claims.subscription))) return true;
  if (req.user) {
    try {
      const row = await store.getSubscription(req.user.id);
      if (row && row.stripe_subscription_id && (row.status === "active" || row.status === "trialing")) return billing.subscriptionActive(row.stripe_subscription_id);
    } catch (error) { console.error("[PRO] account subscription check failed:", error.message); }
  }
  return false;
}
/* free uses are counted per account when logged in, otherwise per browser */
const usageKey = (req, res) => (req.user ? "u:" + req.user.id : usage.getVisitorId(req, res));
module.exports = { isPro, usageKey };
