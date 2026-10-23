# Doc Library / Citations / pricing update

## Navbar
- "Upload to Library" is now **Doc Library** (index.html and doc.html). It opens `/docs`.
- **Citations** opens `/citation-generator` (label now "Citations" everywhere).
- On phones both stay reachable as icon buttons; the library header no longer overflows horizontally.

## /docs (library home) - rebuilt
- Live search (as you type), file-type filters, Latest / Most viewed sort, "Show more" paging, skeleton loaders.
- Upload is built into the page (drop files anywhere or click). Logged-out visitors are sent to log in and their files upload automatically when they return. `/docs/upload` still works and scrolls to the drop zone.
- Five-dot meter: every 5 uploads = 1 free document unlock.

## Document page
- Unlock banner appears **after every 2nd page** (2, 4, 6...; or once if the document has a single page). It shows the three ways in:
  1. $5 for this document (`DOC_PRICE_CENTS`)
  2. Upload 5 documents -> 1 free unlock (`DOC_UPLOADS_FOR_FREE`, default 5)
  3. $30/month all access: every document and every tool
  plus links to the four tools ("first tool use is free", `FREE_TOOL_USES`).
- Download / header buttons open the same options in a dialog.
- New original banner design and copy (no longer mirrors another site's wording or shapes). "Students also studied" -> "Related documents"; "Solutions Available" tick removed from cards.
- Services panel: new animated icons (typing lines, scanning line, flowing connectors), badge no longer collides with the title (the old `.fr` class clashed with upload rows).

## Citations page
- 3-step progress indicator, +/- and quick-pick (5/10/15/20) reference count, "Change file", "Open DOI" per reference, reference count + style in the results header, animated tool tiles, other tools strip.

## Backend
- `GET /api/docs/credits`, `POST /api/docs/:id/unlock-upload` (spends one earned upload credit).
- Active $30/month plan now opens **every** document (cached 60 s so Stripe is not called per view); the old 20-file cap is gone.
- `GET /api/docs/` accepts `kind`, `sort=popular`, `offset` and returns `more`.

## Update: originals, 65% blur, admin delete, SEO/nofollow, animated service cards
- **Documents are shown as originals.** PDFs and images were already rendered to page images; Word (.docx/.doc/.rtf), Excel (.xlsx/.xls/.ods), CSV and TXT files are now converted with LibreOffice and shown with their real layout (an Excel file looks like Excel, not text). The page text stays in the page only as hidden text for search engines. If LibreOffice is missing the file falls back to the old text view. Older documents are converted automatically on the next server start (`backfill`).
- **Blur:** 35% of every page is readable and 65% is blurred (set `DOC_PREVIEW_RATIO`, default `0.35`). Blurring for image pages happens on the server.
- **Admin delete:** a Delete button appears on the document page and on every library card when you are logged into the admin panel in the same browser (it uses the admin token and `DELETE /api/admin/docs/:id`). The admin panel list still has its own Delete.
- **nofollow:** every URL inside a document is written as `rel="nofollow ugc noopener noreferrer"` (page HTML and server-rendered /doc/<slug> HTML). Pages already send `index, nofollow`.
- **SEO documents are removed:** uploads that look like link/SEO promotion (backlinks, guest posts, SEO services, etc. together with a link, or many outbound links - `DOC_SEO_MAX_LINKS`, default 8) are refused; if one is found later it is marked removed and not indexed.
- **Service cards (right side):** illustrated, animated cards for Citations, Document Creator, Image to Text and Diagrams.
- Dockerfile / nixpacks now install `libreoffice-writer`, `libreoffice-calc` and fonts (image gets larger; first Word/Excel upload is slower, a few seconds).

## Update: Study Resources menu + automatic tools
- New **Study Resources** dropdown (`js/study-resources.js`, used in the Doc Library header and the tools pages): School, Textbook Solutions, Literature Title, Study Guides, Flashcards, Grammar Checker, Paraphraser, Proofreader, Spell Checker. **Every entry opens a page on this site; nothing links to Course Hero or any other company.**
- School / Textbook Solutions / Literature Title / Study Guides open the Doc Library filtered by keywords (`/docs?cat=school|solutions|literature|guides`, `cat` filter in `routes/docs.js`).
- Flashcards, Grammar Checker, Paraphraser, Proofreader and Spell Checker are our own automatic tools (`/tools/flashcards`, `/tools/grammar-checker`, `/tools/paraphraser`, `/tools/proofreader`, `/tools/spell-checker`; API `POST /api/tools/write` and `/api/tools/flashcards`). They use the same GROQ_API_KEY, the same free first try and the same $30/month plan as the other tools.

## Update v58: Expert Help, search in column 2, Free AI tools at the bottom, mobile documents first
- **Expert Help** button in the desktop navbar (doc.html, >=1001px; icon-only 1001-1179px). Hover or click opens a menu: Get a free quote (`/#assignment-form`), Ask an expert (`/qa`), Browse study guides (`/docs/guides`). Esc / outside click closes it.
- **Search box** on the library now starts exactly at the left edge of the 2nd document column and runs to the right edge of the content (about 2.4x the old 400px). The grid is 5 columns on desktop, 3 on tablet, 2 on phones; the search follows the same column variable (`--lc`).
- **Free AI tools** moved to the bottom of the library as 5 animated illustrated cards (Document Creator, Image & PDF to Text, CiteMe, AI Detector, Diagram Generator) on a teal diagonal background. Artwork is original inline SVG; cards fade in on scroll. The existing `#cglist .svs / .svp` script still switches "Free try / Included / Plan".
- **Mobile**: documents now come first (title, filters, search, documents), then the upload card, then the Free AI tools.
- Only `doc.html` changed (plus this note). To change a card, edit `ftSection()` in doc.html; to change the Expert Help links edit the `#xh` block in the navbar.
