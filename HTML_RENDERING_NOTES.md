# HTML rendering for search engines (this update)

## Documents (/doc/<slug>)
- Pages are now drawn as real HTML text (selectable, crawlable) in the browser, same as the server-rendered HTML. 35% clear / 65% blurred by CSS.
- A page image is shown ONLY when a page has no text yet (scan waiting for OCR) or the document is held back for personal data.
- Trade-off: Word/Excel/PDF pages no longer show their exact original layout on screen; the original file is still what "Download" returns.

## Tool pages (/tools/*, /citation-generator)
- Each tool now has its own <title>, meta description, canonical, Open Graph, <h1>, nav links, About / How-to / FAQ text and JSON-LD
  (WebApplication, FAQPage, BreadcrumbList) in the first HTML response (backend/services/toolSeo.js). Edit the text there.
- /tools redirects to /tools/document-creator.

## Unknown URLs
- Now return HTTP 404 + noindex instead of the home page with status 200 (soft 404).

## After deploy
1. Restart (Railway redeploy). 2. Search Console > URL Inspection > "View crawled page" on /tools/grammar-checker and one /doc/<slug>.
3. Submit /sitemap.xml and /sitemap-docs.xml.

## Update: original background + 60% blur
- Each page's background colour is read from the rendered ORIGINAL page (most common colour along the page edges) and stored in `doc_pages.bg`
  (new column, added automatically; older documents are filled in the first time they are opened). The HTML page uses that colour; text turns light only if the background is dark.
- Blur: 60% of EVERY page is blurred, the top 40% is readable (same for all pages, any length). Change with `DOC_BLUR_RATIO` (0.6 default). Old DOC_PREVIEW_RATIO / DOC_SHORT_RATIO / DOC_REST_RATIO are no longer used.

## Update: Upload to Unlock, quality + duplicate checks
- "Order help" button replaced by **Upload to Unlock** (opens /docs/upload), placed right next to **Doc Library** in doc.html, js/site-header.js (library + tool pages) and index.html.
- Free unlocks: upload at least **5** qualifying documents -> **5** free unlocks (another 5 for every further 5 uploads).
  Env: DOC_UPLOADS_FOR_FREE (5), DOC_UNLOCKS_PER_BATCH (5).
- Pages: any user can upload a document of any length. Only documents with **3+ pages** (DOC_MIN_PAGES) count toward unlocks; for shorter ones the upload
  result shows: "Upload minimum 3 pages in order to get unlock."
- Duplicates are refused with a "Duplicate document" message and are not stored:
  * identical file (SHA-256) already in the library, or
  * text about **80%+** the same as a document already in the library (DOC_DUP_SIMILARITY, default 0.8). Text is compared with 3-word MinHash fingerprints
    (new columns docs.sig / docs.nsh, filled automatically for existing documents on the first upload after deploy).
- Several files in one upload are checked one by one: good files are saved, refused ones are listed with the reason.
- Limitation: a scanned PDF/photo with no readable text can only be caught as an exact duplicate until OCR has produced its text.

## Update: Upload to Unlock click
- The button now opens the file picker immediately (data-doc-upload + js/docs-upload.js, loaded by site-header.js on the tool pages). Chosen files wait in the browser,
  the visitor is sent to log in if needed, then /docs/upload sends them automatically. Without JavaScript the link still opens /docs/upload.

## Update: unlock = read + download
- Using an unlock on a document opens it completely (no blur, no gate) and enables Download (original file) for that document.
  After unlocking, the page shows a "Unlocked" banner with a Download button. One unlock = one document; unlocking a document that is already readable spends nothing.

## Update: uploader / date / rating row
- Under every document title: **uploader** (first name + last initial, "Member" if unknown) • **upload date** • **helpful rating** "96% (71)" with thumbs-up / thumbs-down buttons • **original file name**.
- Rating = share of thumbs-up among all votes. One vote per logged-in member (new table `doc_votes`, created automatically); pressing the same thumb again removes the vote.
  Visitors who are not logged in are sent to log in when they press a thumb. API: `POST /api/docs/:id/vote {vote: 1 | -1 | 0}`. The row also appears in the server-rendered HTML for crawlers (no star markup / aggregateRating is added to the structured data).

## Update: unlock bar, $30 pack, exact background, no "Snippet"
- The word/section **Snippet** is gone (doc.html and the server-rendered HTML in server.js). The page text stays in the HTML for search engines.
- **Unlock bar on every page** (animated purple/pink/orange gradient, floating shapes, idea from the Course Hero "Want to read all N pages?" bar). A **1-page document** gets the bar **in the middle of the page** (`.pg.one`).
- Three options in the bar and in the Download pop-up:
  1. **$5** - download this document (DOC_PRICE_CENTS, 500).
  2. **Upload 5, get 5 unlocks** (unchanged rule: 3+ pages each, no duplicates).
  3. **$30 = 30 unlocks, valid 1 month** - one Stripe payment (no subscription). New table `doc_packs`. Spending an unlock opens that document for reading + download for good; only
     buying/using new unlocks stops after the month. Env: DOC_PACK_PRICE_CENTS (3000), DOC_PACK_UNLOCKS (30), DOC_PACK_DAYS (30).
  API: `GET /api/docs/pack`, `POST /api/docs/pack/checkout {doc_id}`, `POST /api/docs/:id/unlock-pack`; `/confirm` records the pack. After paying, the visitor returns to the document and one unlock is spent on it automatically.
  The old $30/month plan routes are kept for the tools pages (/tools, /citation-generator) and for members who already have it.
- **Exact background**: the page colour is now the median of the dominant colour along the real page edges (higher resolution than before; only pure white noise is snapped to #fff).
  All stored colours are re-detected once after this deploy (flag `bg_v2` in `doc_flags`). Library thumbnails also take the page-1 colour.

## Update: unlock balance in the navbar, automatic debit, account list
- **Navbar chip** (js/unlock-chip.js, in doc.html and every tool page via site-header.js): lock icon + number of unlocks left = earned upload unlocks + unlocks left in the paid 30-pack. Click = account > My documents.
- **Automatic debit**: pressing Download on a locked document asks "Use 1 of your N unlocks?" and, on OK, spends one (`POST /api/docs/:id/unlock-auto`): earned upload unlocks first, then the paid pack (the one expiring first). Nothing is spent if the document is already readable. The bar options "Upload 5" and "30 unlocks" debit the same way.
- **Account > My documents > Unlocked documents** (`GET /api/docs/unlocked`): every unlocked document, what it was unlocked with (upload / 30-pack / $5), the date, and how many times it was downloaded (new table `doc_downloads`, filled by `/api/docs/:id/download`), with a Download button.
- Unlocked documents stay unlocked and downloadable as long as the account exists; only unused pack unlocks expire after the month.

## Update: phone version
- **Doc Library in the top bar**: homepage (`.mob-doc` pill next to the menu button, always visible under 992px; icon-only below 350px) and the document pages (labelled pill; search moves to its own row; Study Resources / Upload icons are hidden on phones to make room).
- **Short request form on phones (<=767px)**: only email, mobile number, attachment and the submit button (`js/mobile-form.js`). The hidden fields are disabled (not validated, not sent) and `quick=1` is posted; the server (`createSubmission`) then fills name, subject, a placeholder deadline (tomorrow 18:00 IST) and a message saying the details are in the attachment. Server requires a valid email, a phone number and at least one file in quick mode. Desktop keeps the full form.
- **Interactive**: floating "Get help" button that scrolls to the form (`js/mobile-cta.js`), sticky "Unlock full document - from $5" button on document pages while no unlock bar is on screen, touch feedback, smooth scrolling.
- **SEO / mobile**: same HTML content on phone and desktop (mobile-first indexing), `theme-color`, 44px+ tap targets, 16px form fields (no iOS zoom), the form header text is swapped by script only on phones.

## Update: pages look like the original document (Course Hero style)
- A page that has an image (every PDF / Word / Excel / image upload) is now drawn as the ORIGINAL page: logo, tables, fonts, colours and background exactly as in the file. Visitors who have not unlocked it get the server's preview (top part clear, the rest blurred); unlocked members get the full page.
- The page text stays in the HTML (visually hidden `.sr` block, real text, not display:none) so search engines, screen readers and "Search this document" still work. Documents with no page image (rare) fall back to the HTML text rendering with the original background colour.

## Update (latest) - supersedes the "pages look like the original image" note above
- The readable part of every page is **real HTML text again**, strictly **20%** of the page height (80% blurred). Fixed in code (`BLUR_RATIO = 0.8` in docService.js and `CLEAR = .2` in doc.html); the DOC_BLUR_RATIO variable is no longer used. A page image is shown only for a page that has no text at all.
- **Snippet box restored** (document page and the HTML that search engines read), exactly as it was originally.
- **Unlock bar is compact** (about 40% of its previous height).
- **Delete all uploaded library documents (admin only):** `POST /api/admin/docs/delete-all` with header `Authorization: Bearer <admin token>` and body `{"confirm":"DELETE ALL DOCUMENTS"}`. Pages, stored files, unlocks, votes and download history go with them; members' earned upload unlocks disappear too (they are counted from uploads); paid 30-packs are not touched. This cannot be undone.
- **Clear cookies:** open `/clear-cookies` in a browser; it asks that browser to delete this site's cookies, storage and cache (it logs that browser out). Cookies live in each visitor's browser, so the server cannot delete other people's.

## Update: 50% clear / 50% blur, lighter blur
- Every page: top **50%** readable, bottom **50%** blurred (`BLUR_RATIO = 0.5` in docService.js, `CLEAR = .5` in doc.html; page 1 no longer gets a larger clear share).
- The blur is lighter so line shapes / layout stay visible (Course Hero style): CSS `--blur:4px` for text pages; for page images the hidden part is shrunk to 1/5 width and blurred 2px. Documents held back for personal data keep the old heavy blur.

## Update: animated Doc Library home
- Same layout (title + filters left; upload box and four study tools right; document grid below). Added: staggered entrance, gradient title, press feedback on chips, sliding Latest/Most-viewed pill, pulsing drop zone, cursor spotlight on cards, scroll-reveal document cards with zoom + "View document" hover button, back-to-top button. All in `<style id="lib-anim">` and the script at the end of doc.html; honours prefers-reduced-motion.
- Tool-card icon height reduced to 80% of the previous size (`.svx{aspect-ratio:11/3.84}`).

## Update: pages are real HTML that looks like the original (Course Hero style)
- At upload, PDF pages (and Word / Excel / text files, which LibreOffice turns into a PDF first) are split with poppler's `pdftohtml`:
  * `doc_pages.bgimg` = the page WITHOUT its text (logo, banners, table lines, shapes, colours) -> CSS `background-image` of the page (`GET /api/docs/:id/bg/:n`, public, text-free).
  * `doc_pages.lay` (JSONB) = every text line with position, font size, font family, colour, bold / italic, links -> real HTML `<span>`s placed with CSS (sizes in `cqw`, so everything scales with the page width).
- Visible part: **page 1 of a document with more than one page is fully readable; every other page (and a 1-page document) shows only the top 20%.** The rest is blurred by CSS (`.vl` overlay + `.bl` spans). Change in `visibleRatio()` (docService.js).
- Not-indexable documents only receive the lines inside the readable part; indexable documents send all text (blurred by CSS) so crawlers read it, same as before.
- Pages with almost no text (scans, photos) stay page images blurred on the server. Pages the layout cannot be built for fall back to the old reflowed text.
- Documents uploaded earlier are converted the first time they are opened (`ensureLayout`). Needs `pdftohtml` (same poppler-utils package already installed by the Dockerfile / nixpacks.toml).

## Update: unlock bar on every page + SEO text from the layout
- The unlock bar now sits in the middle of EVERY page (doc.html: `.pg.one` on each page when the bar is shown), not only on 1-page documents.
- The PDF text extractor (pdf-parse) could drop the spaces between words ("Classifythefollowingbodyparts"). The stored page text (`doc_pages.body`) now comes from the layout (`layText()`), which keeps the spaces and the row order. New uploads use it at once; older documents are corrected the first time they are opened (`ensureLayout`). Snippet, description, keywords and search use this text.
- The server-rendered HTML that crawlers get now contains the same laid-out pages as visitors (`layPageHtml()`): positioned lines with the original design as CSS background; lines below the readable part carry `.bl` (blurred by CSS, declared paywalled in the JSON-LD). The old flat text block is only used for pages without a layout (scans).

## Update: 25% clear, full text in the HTML source, search-driven window
- **Clear share**: page 1 of a multi-page document is 100% readable; every other page (and a 1-page document) shows **30%** of the content (`DOC_CLEAR_RATIO`, default 0.30).
- **Full text in View Source**: every laid-out page now has a `<div class="sr" id="text-N">` with the WHOLE page text as normal paragraphs (lines of one paragraph are joined, so a
  sentence is one unbroken string, e.g. "Mia had $100 ... How much money does she have altogether?"). The positioned line spans are `aria-hidden` (no double reading).
- **Snippet**: no longer cut at 300 characters with "…". It is cut at the end of a sentence (400-800 chars), "…" only when more text follows.
- **Search shifts the clear window** (same 25% height, moved to the matching lines; page 1 stays fully clear):
  * server HTML: `/doc/<slug>?q=pocket+money` (also `?search=`, or the query a search engine puts in the Referer: Bing, Yahoo `p=`, DuckDuckGo, Ecosia, Yandex, Baidu `wd=`);
  * browser: same URL parameters + the "Search this document" box (window moves, page scrolls to the first matching line).
  Google does not pass the query to the site, so for Google visitors the window shifts only through the in-page search box.
- **Google snippets**: `data-nosnippet` is no longer put on the blurred text, so Google may quote the part matching a user's query in its result. Set `DOC_NOSNIPPET=1` to put it back.
- Only indexable documents shift (the others never send the hidden lines to the browser). Fallback pages without a layout (scans / reflowed text) keep the fixed top window.
