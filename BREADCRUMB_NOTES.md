# Breadcrumb inside the content box (v13)

The breadcrumb ("Home / page") now sits INSIDE each page's content box with its own rounded home-icon box on the left.
The page navbar is unchanged. The strip that used to sit above the hero on static pages was removed (it would have shown twice).

| Pages | Where it comes from |
|---|---|
| Static / service pages (e.g. /write-3000-words-...) | `backend/services/staticShell.js` (top of the article box, above the title line + reading-progress bar) |
| Q/A: /qa, /qa/ask, /qa/<slug> | `backend/services/qaPages.js` (`crumb()` helper) |
| Doc Library: /docs, /docs/upload, /docs/<category>, /doc/<slug> | `js/crumb.js`, loaded in `doc.html` (placed just above the page content) |
| Tool pages /tools/<tool> | `js/crumb.js`, loaded in `tools.html` (top of `.wrap`) |
| Citation Generator /citation-generator | `js/crumb.js`, loaded in `citation-generator.html` (top of `.wrap`) |

On a document page the last item follows the document title once the page script has loaded it.
Pages not listed (home, login, signup, account, agent) were left as they were.

## v14: icon replaces the word "Home"
The breadcrumb now reads [home icon] / Page title. The word "Home" was removed and the home icon (gradient rounded square with a white house) is the first item, linking to "/".
Changed in: `backend/services/staticShell.js`, `backend/services/qaPages.js`, `js/crumb.js`.

## v14: "Assignment" -> "Expert"
All visible text (headings, buttons, form labels/placeholders/alerts, emails, admin, chat prompts, titles, manifest) now says "Expert".
Internal names were left alone so nothing breaks: form id `assignment-form`, CSS classes `assignment-form-*`, upload field `assignmentFiles`, DB column `assignment_details`, and domains/emails such as `assignmenthelp`.
