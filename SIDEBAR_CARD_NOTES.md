# Right-side card removed; order bars + interactive paragraphs

**Removed:** the right-hand card (Doc Library / Upload to Unlock / Citations / AI Detector + "why us" list) from every page.
`js/side-card.js` is deleted and `sideBlock` is gone from `backend/services/staticShell.js`.

**Navbar:** the tools now live in the top navbar only.
- Home page + static pages: the existing `.nav-tools` group (AI Detector, Doc Library, Upload to Unlock, Citations). The CSS rule that hid it on static pages was removed.
- Service pages (`js/site-header.js`) and `doc.html`: Doc Library, Upload to Unlock, Citations and an AI Detector button (`data-ai-detector`) were added. Labels collapse to icons on narrower screens.

**Order bar** (terracotta "Avail online ... now / Place your order right away! / Place your order >"), `js/content-enhance.js`:
| Page | Bars | Paragraph effects |
|---|---|---|
| Static pages | blue "Need help" bar at ~30%, ~60% (each right before a heading) + bottom, different headline on each (orange bar not used here) | yes |
| Home page | before Reviews + before the footer (full-width band) | About / Services / Reviews / Contact |
| Q/A pages | middle + bottom | yes |
| Citation Generator, tools, Doc Library | bottom only | no |

**Paragraph effects:** fade/slide-in on scroll, accent rail that draws on hover and while the paragraph is in the middle of the screen, animated highlight on `<strong>`, floating Copy / Read-aloud toolbar (hover on desktop, tap on touch). `prefers-reduced-motion` gets a static version.

Options (data-attributes on the script tag): `data-root`, `data-paras`, `data-bars` (both|bottom|off), `data-style` (card|band), `data-mid`, `data-end`, `data-title`, `data-href`.
