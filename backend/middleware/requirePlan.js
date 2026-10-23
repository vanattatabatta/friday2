"use strict";
/* Every service (citations, document creator, OCR, diagrams) needs a logged-in account. Subscribers use it freely; everyone else gets
   FREE_TOOL_USES free successful uses (default 1), then is asked to subscribe to the $30/month plan. */
const { optionalUser } = require("./userAuth");
const S = require("../services/docService");
const F = require("../services/freeTrial");

const PAYWALL = "You've used your free try. Subscribe for $30/month to keep using every service.";

function requirePlan(req, res, next) {
  optionalUser(req, res, async () => {
    try {
      /* Every service needs an account: guests are sent to log in / sign up and come back to the page they were on. */
      if (!req.user) return res.status(401).json({ success: false, needsLogin: true, message: "Please log in or sign up to use this tool." });
      if ((await S.planStatus(req.user.id)).active) return next();
      const taken = await F.reserve(req, res);
      if (!taken) return res.status(402).json({ success: false, needsPlan: true, loggedIn: !!req.user, message: PAYWALL });
      /* the free try is only spent when the service actually delivered a result */
      const send = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 400 || !body || body.success === false) F.refund(taken);
        else if (body && typeof body === "object") body.freeTry = true;
        return send(body);
      };
      res.on("close", () => { if (!res.writableFinished) F.refund(taken); });
      next();
    } catch (e) { console.error("[PLAN]", e.message); res.status(500).json({ success: false, message: "Could not check your plan." }); }
  });
}
module.exports = { requirePlan };
