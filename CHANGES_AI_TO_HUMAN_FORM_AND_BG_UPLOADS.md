# Partial update (Oct 23 2026)

## 1. AI to Human Expert: compact form + admin tab
- `ai-to-human-expert.html`: compact form like the home-page one (name, email, contact number with auto country flag from IP,
  AI tool, Expert Deadline date, Deadline Time hour, description, attachments, Submit Expert).
- Order ID for these orders: `AI` + DD + MM + YY + HH + mm (IST), e.g. 23 Oct 2026 15:12 -> `AI2310261512`
  (`submissionController.js`, form sends `form_type=ai_to_human`). Admin e-mail subject says "New AI to Human Expert Requirements".
- Admin panel: new tabs **All orders / Expert Help / AI to Human** with counts (AI orders = order ID starting with AI).

## 2. Doc library: uploads continue in the background
- New `js/upload-manager.js`: files are kept in IndexedDB, sent in 1 MB pieces, resumed on any page after refresh/navigation.
- Server (`routes/docs.js`): `POST /api/docs/upload/session`, `PUT .../:sid?offset=N`, `POST .../:sid/finish`, `GET .../:sid`.
  After finish the server reads and saves the document by itself (no browser needed). Per-file logic moved into `processFile()`.
- `doc.html` upload page shows live progress and re-attaches after a reload; other pages show a small progress chip.
- Not yet tested on a live server (no network in the build sandbox).

## Checks done in the build sandbox (no browser / no database available)
- Upload manager: simulated a refresh in the middle of an upload; the next page resumed from the bytes the server already had, each file was saved once.
- Server session routes (`/api/docs/upload/session*`): retry, out-of-step, wrong-owner, early finish, double finish and size-limit cases behave as designed.
- AI order ID format verified: `AI` + DDMMYY + HHmm (12 characters, fits the order_id column).
- Still to check on your live site: real form submit, admin "AI to Human" tab, upload through a real refresh.
