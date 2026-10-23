# Lighthouse / PSI fixes (v16) - desktop report for /

Measured locally in headless Chrome at the PSI desktop viewport (1350x940) with JS responses delayed to mimic a real network.

| | Before | After |
|---|---|---|
| CLS (desktop) | 0.42 (live PSI: 0.253) | 0.005 - 0.010 |
| CLS (mobile 390px) | 0.161 | 0.005 |
| Non-composited animations (desktop / mobile) | 26 / 18 | 0 / 0 |
| JS-forced reflow time | 18-24 ms | 0.4-2 ms (only main.js header aligner left) |

## 1. Layout shift (CLS 0.253) - root cause
`<main id="main-content">` (0.143) and `<section id="about">` (0.076 + 0.030) were not themselves changing. The *top bar above them* grew from
41px to 81px and back again, shoving the whole page down and up:
1. `main.js` adds `html.hdr-x` (right-aligns the top bar to the form edge).
2. `lang.js` then injects the language pill into `#topbar .top-right`. The row no longer fit, so `.top-contact` wrapped onto 2 lines (41 -> 81px).
3. `main.js` re-measured on `fonts.ready` / `load`, saw it did not fit, removed `hdr-x` (81 -> 41px).

Fix (index.html):
- `#topbar` is a non-wrapping fixed-height row on desktop (`.top-contact` / `.top-right` = `flex-wrap:nowrap`, `min-height:41px`).
- The language pill's box is reserved in the HTML: `<span id="ah-lang-slot">` (77x24). `lang.js` swaps it for `#ah-lang` (same 77x24), so
  nothing moves when the script arrives. If the slot is missing (other pages) it falls back to the old insert.

## 2. Non-composited animations
Only `transform` / `opacity` / `filter` run on the compositor. Everything else was rewritten to those:
- `orderFlow` (background-position, 4 nav buttons): gradient now lives on an `:after` layer that is translated (seamless 2-tile loop).
- `signupShine` / `eob-shine` / `mobdsh` (`left`): full-size `:before` with the stripe inside the gradient, translated + skewed.
- `loginPulse` / `signupPulse` / `orderPulse` / `eob-ring` (box-shadow halo): now a subtle scale + brightness pulse (see "visual changes").
- `aicScan` (`top`) -> translateY.  `formBorderMove` (`left`) -> translateX.
- `livePulse` (hero dot) and `ftPulse` (footer dot): ring is a scaled/faded pseudo-element.
- `mobdoc` (mobile Doc Library / Upload to Unlock buttons): same transform trick as orderFlow.
- `navGlow` (nav `:before`): now fades (opacity) instead of sliding a 7%-alpha gradient.
- `textGlow` (hero h1 gradient text) removed: animating background-position on `background-clip:text` can never be composited.
- `eob-bg` (order bar gradient drift) removed.
Sources edited: `css/style.css`, `css/submit.css`, `src-js/content-enhance.js` and the inline `<style>` in `index.html`.

### Visual changes (the only ones)
- Login / Signup / Order Now / Doc Library / Upload to Unlock / Citations / order-bar button: the expanding halo ring is now a gentle
  "breathing" scale (about 4%) with a slight brightness lift. A ring that grows outside a button is impossible to composite when the button
  also has `overflow:hidden` (needed to clip the shine). If you prefer the halo, leave this one item as an informational Lighthouse note.
- Hero heading's gradient no longer slowly slides; nav glow and the order-bar background are static / fading.

## 3. Forced reflow
- `content-enhance.js` (19ms): all `getComputedStyle` reads now happen *before* the `<style>` is injected and before bars are inserted.
- `livechat.js` (16ms): `scroll()` is a no-op while the (display:none) chat box is closed; it still scrolls on open.
- `chat-widget.js` (5ms): initial height measurement moved into a `ResizeObserver` (callback runs after layout); textarea auto-grow
  skips the empty/never-grown case at load.
- `main.js`: untouched. The remaining ~0.4-2ms is the header aligner, which has to measure.
- "[unattributed]" (75ms in the report) is not attributed to any of your files; likely browser-internal / PSI's own tooling.

## Not changed (user-triggered, not in the page-load audit)
`.ah-flash` (form field flash on validation) and `.eop-say` (paragraph while read aloud) still animate box-shadow.

## Deploy
Rebuilt with esbuild (reproduces the previous v15 output byte-for-byte for untouched files), `build-critical-css.py`, `compress-assets.js`.
Upload `index.html`, `css/*`, `js/*` including the `.gz` / `.br` copies. Changed scripts got new `?v=` values.
