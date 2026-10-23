# Lighthouse fixes (v15) - mobile report for /database-expert-help

Accessibility (was 91)
- Heading order: the form title is now an <h2> (was <h3> straight after the <h1>). CSS selectors, mobile-form.js and the inlined critical CSS were updated.
- Contrast: breadcrumb links #337ab7 -> #1d4ed8, current page #6b7280 -> #374151; orange (#f7931e) buttons / step badges with white text -> #c2410c.
- ARIA: the "steps" card no longer claims role=tablist/tab (there were no tabpanels); it is a plain group of buttons with aria-expanded. Arrow-key navigation still works.

Performance (was 81)
- js/file-mode.js no longer blocks rendering (it is only loaded on file://).
- Fonts: Google Fonts now use display=optional, so a late font can never shift the layout (CLS was 0.210, all from font swaps).
- livechat WhatsApp config request waits for load + idle (it was part of the critical request chain).
- content-enhance.js reads styles for all paragraphs first, then writes classes (forced reflow).
- All JS minified (js/*.js). Readable sources are in src-js/. Edit there, then run: sh build-js.sh
- Precompressed .gz/.br refreshed (node compress-assets.js).

Best practices (was 96)
- Agent photos (img/agents/*.jpg) are not in the project, so the chat widget requested a missing JPG = 404 in the console. Photos are now opt-in: set agentPhotos:true in window.AH_LIVECHAT in index.html once the JPGs are uploaded.

Cache: changed JS files got a new ?v= value.
