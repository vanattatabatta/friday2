# Changes: order ID, post-submit refresh, admin country + flag

## Order ID
- New format: `AH` + YY + MM + DD + HH + mm (IST), e.g. 2 Oct 2026 15:12 -> `AH2610021512` (12 chars, fits `order_id VARCHAR(12)`).
- A second order in the same minute now takes the next free minute instead of failing; generation is serialized with a Postgres advisory lock.
- Older orders keep their old IDs (`AHHHMMDDMMYY` style).

## After submit
- `js/submit.js`: success box shows the Order # with a 5-second countdown, then the homepage reloads / returns to `/`.
- `js/submit.js.gz/.br` and `index.html.gz` regenerated; `index.html` script version bumped to `?v=20261002a` (needed because JS is cached for 1 year).

## Admin country code + flag
- Country is taken from the CDN/proxy header when present (Cloudflare `CF-IPCountry`, Vercel, CloudFront), otherwise looked up via ipwho.is -> country.is -> ipapi.co with 3 retries (ipapi.co alone was rate-limiting/blocked on hosting IPs, leaving rows `Pending`/`Unknown`).
- The 2-letter code is always saved in `submissions.country_code`.
- Old rows with no code are fixed automatically in the background when the admin list loads (25 rows per minute).
- Admin table and detail view now show flag + code + country name, e.g. `IN India`.

---
# Round 2: flags, chat minimize, language picker

## Flags (admin + site)
- Cause of the missing flag: flags were loaded from flagcdn.com. If that request is blocked/fails, the fallback was an emoji flag, and Windows cannot draw emoji flags, so only the letters "IN" appeared.
- New `js/flags.js`: built-in inline-SVG flags (no external request) for US, UK, Canada, Australia, New Zealand, India, every European country, plus Turkey, China, UAE, Vietnam. Detailed emblems are simplified.
- Used by: admin table + detail modal, agent console (`agent.html`), top-bar language picker, live-chat language menu.
- Countries without a built-in flag still try flagcdn, then show a small grey code badge (never bare letters).
- Admin shows: flag + country code + country name. admin.js / admin.css / flags.js are cache-busted (`?v=20261002f`).

## Chat minimizes when the submit form is used
- `js/submit.js` fires an `ah-form-active` event when the assignment form is focused/touched.
- `js/livechat.js` (live chat) and `js/chat-widget.js` (assistant) both collapse on that event; live chat also no longer auto-opens or shows its teaser after the form has been used. The launcher button stays so visitors can reopen it.

## Language picker: manual only
- `js/lang.js` rewritten: no IP lookup, no browser-language guess, no "View this site in ...?" popup. Default is English (US).
- Picker: English (US/UK/CA/AU/NZ) - these keep the page in English (only the label/flag and `<html lang>` change); 27 European languages with their country flags; Hindi, Chinese, Arabic, Vietnamese. Choosing a non-English language loads Google's translator on demand (as before).
- `js/livechat.js`: removed the browser-language / IP-based language selection; the chat is English unless the visitor picks one (chat UI text exists for en, fr, hi, de, zh, ar, es, it, vi; other picks leave the chat in English).
- Compressed .gz/.br copies regenerated for every changed file.

---
# Round 3: admin layout + humanizer

## Admin layout
- Removed the "LIVE OPERATIONS / Submissions / Review requirements..." heading block.
- Header is now one row: brand on the left; Humanize text, WhatsApp chat (shows the active number), Refresh, Live chat and Logout on the right. Stats cards sit directly below, then the submissions table. Wraps cleanly on phones.
- Humanizer and WhatsApp settings open as pop-ups from the header (Esc / click outside closes). The WhatsApp pop-up still opens by itself the first time if no number is saved. Red dot + "No number set" when empty.
- admin.css / admin.js cache-busted (?v=20261003b).

## Humanizer (backend/services/humanizeService.js, routes/aicheck.js)
- Stronger rewrite brief with a worked example and concrete rhythm rules (short + long sentences, varied openers, plain words), temperature 0.9.
- Retries once if the model fails, and once more if numbers / years / quotes / (Author, 2020) citations went missing (counted, so a citation used twice must appear twice).
- Deterministic clean-up of stock AI words, "Moreover/Furthermore..." openers, "it is important to note that", and em dashes the model left behind. Contractions only for professional/casual tones.
- Re-scores every sentence with the site's own checker; sentences still scoring >= 50% are rewritten individually (with neighbours as context), up to 2 passes, and the best-scoring version is returned.
- Response now includes before/after scores, repair passes and warnings; the admin pop-up shows "AI score 82% -> 18%" plus any warning. Needs GROQ_API_KEY (unchanged).

---
# Round 4: heading removed for good, 20-word AI-score minimum

- Admin: the "LIVE OPERATIONS / Submissions / Review requirements..." heading is gone from the HTML and its leftover CSS was deleted. admin.css is cache-busted (?v=20261003c). If you still see it, the old files are still deployed or cached: redeploy the whole zip and hard-refresh (Ctrl+F5).
- AI detector minimum is now 20 words (about two lines), down from 80, in both the server (`aiDetectService.js`) and the site box (`js/ai-detector.js?v=20261004ai7`, .gz/.br regenerated).
- Under 80 words the result is labelled "short text, so less reliable", and the "very even sentence length" signal is faded in gradually so two or three sentences are not wrongly scored as AI.

## Oct 4 update: AI Detector, AI to Human Text, chat size, agent photos
- AI Checker renamed to AI Detector: `js/ai-checker.js` is now `js/ai-detector.js` (.gz/.br regenerated, script tag in index.html updated).
- Detector result now follows the ZeroGPT layout: highlighted suspected-AI sentences on the left, overall AI % card (feedback line, word/character/AI-sentence counts) on the right. API adds `feedback` and `characters`.
- New public "AI to Human Text" tab in the same panel (readability + strength options, before/after score, copy button). `POST /api/aicheck/humanize` is no longer admin-only; limited to 8 requests per 10 min per IP; needs GROQ_API_KEY.
- Live chat window and launcher buttons reduced to 85% (desktop zoom 1.1 to 0.935, buttons 56 to 48px, mobile height x0.85).
- Agent avatars are photo-only (`img/agents/<first>-<last>.jpg`); the SVG portrait generator was removed. Missing photos show initials.

## Oct 4 update 2: free-use limit, paywall preview, highlights
- AI to Human Text: 2 free full rewrites per account (or per browser/IP when logged out), set with `FREE_HUMANIZE_LIMIT`. Paid $30/month subscribers (same plan as the chat) are unlimited. Counters live in the existing `chat_usage` table under a `humanize:` key prefix. A failed rewrite does not use up a free use.
- After the free uses: only the first ~10% of the text is rewritten and returned; the other ~90% is replaced on the SERVER by random blurred filler (the real hidden text is never sent to the browser). The "Unlock your humanized text" button goes to the existing Stripe checkout.
- After a rewrite, sentences that still score as AI are highlighted yellow in both the AI box (your original) and the Human box.
- `GET /api/aicheck/humanize/status` returns remaining free uses; the panel shows "2 of 2 free uses left".
- Detector: Groq score now has 35% weight (was 50%) and the prompt no longer says "be conservative", to stop it pulling polished AI essays down. Bullet glyphs are ignored when scoring.
- New `services/proService.js` shares the "is this visitor subscribed" check between chat and the humanizer.

## Oct 4 update 3: detector scoring (backend/services/aiDetectService.js only)
- The Groq model can now only raise a sentence's score or nudge it down by 12%; before, a lenient model answer pulled a full AI essay down to ~57%.
- Document-level evidence: when most sentences look machine-written, that lean is amplified across the whole text (as Turnitin/ZeroGPT effectively do). Headings take the body's average instead of dragging it down.
- New signals: em dashes without spaces, non-breaking hyphens (a common ChatGPT copy artifact), semicolons, "while/both/not only" balanced clauses.
- Local test set: AI essay 100%, casual human text 0%, formal encyclopaedia-style human text 26%.

## Oct 4 update 4: stronger humanizer (backend/services/humanizeService.js, new humanTouch.js, js/ai-detector.js)
- Repair loop now runs up to 6 rounds on "Maximum" (2 on Balanced, 0 on Light) and keeps going until the site detector reads 8% AI or less. Before, it stopped after the first round that did not improve.
- Each round: (A) deterministic edits on still-flagged sentences (`humanTouch.js`: splits long balanced sentences, swaps formal words, drops stock openers, removes em dashes / non-breaking hyphens / semicolons, optional contractions), then (B) the model rewrites whatever is still flagged, with a prompt that now asks for short/long rhythm and bans "both X and Y", "while X, Y", "not only X but also Y".
- "Maximum" is now the default strength; time budget raised to 110 s. Contractions are allowed on Maximum even in academic tone.
- Offline test with a fake model that changes nothing: 100% AI -> 65% (Balanced) -> 48% (Maximum). With a real model on top, results should be lower; this was not measurable without a Groq key.
