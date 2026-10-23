# Crawlable documents, 30% visible (v22)

## What changed
- Indexable document: 100% of the text is in the page HTML for everyone (people and crawlers get the identical page).
  About 30% of each page is shown clearly (`DOC_PREVIEW_RATIO`, default 0.30). The other 70% is real text inside `<div class="bl">`,
  blurred by CSS. JSON-LD says `isAccessibleForFree:false` + `hasPart.cssSelector ".bl"` (Google's paywalled-content markup),
  and `data-nosnippet` keeps the gated text out of search snippets.
- Text first: pages are drawn as HTML text, not images. A scan shows a blurred image only until OCR finishes (needs tesseract: already in the Dockerfile).
- Privacy gate (`piiReasons` in docService.js): documents with a PAN / Aadhaar / SSN, bank or card details, tax or payroll records,
  date of birth, ID or medical-record wording are marked `idx=0`. They get `noindex`, are left out of /sitemap-docs.xml, send NO readable
  text to visitors (everything scrambled on the server, page images fully blurred), and the reason is saved in `docs.idx_note`.
  Scans are unindexed until OCR text exists. There is deliberately no switch to force-index a flagged document.
- Admin kill switch for any document: `UPDATE docs SET noindex=true WHERE id=...;`
- Sitemap: submit /sitemap-docs.xml in Google Search Console and Bing Webmaster Tools. It lists only `idx=1 AND noindex=false` documents.

## Trade-off to know about
The 70% is in the HTML, so anyone can read it with View Source / dev-tools. That is how every gated-but-indexed site works,
because serving crawlers something different from people is cloaking and gets a site de-indexed. If the hidden text must stay secret,
it cannot also be indexed.

## After deploy
Restart once: new columns are added and every existing document is classified in the background (look for "[DOCS]" lines in the log).
