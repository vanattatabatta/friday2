# Hire AI to Human Expert (Oct 23 2026)

- Removed the free "AI to Human" rewriter: `POST /api/aicheck/humanize`, `GET /api/aicheck/humanize/status`,
  `backend/services/humanizeService.js` and `backend/services/humanTouch.js` are gone (FREE_HUMANIZE_LIMIT is no longer used).
- "Hire Humanize Expert" is now **Hire AI to Human Expert** (AI Detector page, both buttons) and opens `/ai-to-human-expert`
  (`ai-to-human-expert.html`, also reachable as `/ai-to-human-expert.html`).
- New page fields: Title, GPT / AI the text came from (ChatGPT, Gemini, Claude, Copilot, DeepSeek, Grok, Perplexity, Meta AI, Other),
  Description, multiple attachments (up to 20 files, 20 MB each), plus Email and Contact number. Submit button: **Hire AI Expert**.
- It posts to the existing `/api/submissions` (same order ID email, admin panel and files). Subject is saved as
  `[Hire AI Expert] <title>`; the AI tool and description are in the message. `textok=1` lets a description of 20+ characters
  go through without a file.
- Cache-busting versions bumped for site-header.js, auth-gate.js and ai-detector.js.
