# Questions & Answers (/qa)

## Pages
- `/qa` list (indexable) · `/qa/ask` form (noindex) · `/qa/<slug>` one question + its answer. All server-rendered HTML. "Q/A" link added next to Citations in the header (doc.html and js/site-header.js).

## Flow
1. **Member posts a question** (`POST /api/qa/ask`, login needed). It is saved and **live in the same request** at `/qa/<slug>`.
2. **`/qa-sitemap.xml`** is read from the database on every request (no cache, `Cache-Control: no-cache`), so the new URL is listed at once. It is also in `robots.txt`.
   Search engines still decide *when* to crawl: Google has no ping API any more. Set `INDEXNOW_KEY` to notify Bing / Yahoo / Yandex immediately (key file served at `/<key>.txt`).
3. **Expert answers** (`POST /api/qa/:id/answer`): the answer shows on the **same URL**; `<lastmod>` of that URL in the sitemap moves forward. Experts = members listed in `QA_EXPERT_EMAILS`,
   or set with `POST /api/qa/admin/expert {"email":"...","expert":true}` (admin bearer token). Experts can edit their answer on the question page.
4. **Who sees what**: question = fully visible to everybody. Answer = the whole text for the asker, experts and members who opened it; everybody else sees the first 30% (`QA_ANSWER_CLEAR_RATIO`) and the rest blurred.
   By default the blurred 70% is **scrambled on the server** (it is not in View Source). `QA_CRAWL_FULL=1` puts the real text in the HTML like the documents (indexable, but readable in View Source: that also lets anyone skip the membership).
   JSON-LD (QAPage) contains only the part everybody can read.

## Limits and money
- **2 free questions per member** (`QA_FREE_QUESTIONS`). Then the **$30 membership** (one Stripe payment, no subscription): **30 questions + 30 answer views, valid 30 days**.
  A view is spent when the member presses "Use 1 of your N answer views"; that answer stays open for the member. Spending is one atomic SQL update (no double spend); the free quota is re-checked after the insert.
- Questions with personal / financial data (same check as the documents) are live for their owner but `noindex` and left out of the list and the sitemap.
- Owner (or expert) can delete a question: its page and sitemap entry disappear.

## Tables (created automatically on start)
`qa_questions`, `qa_answers`, `qa_passes`, `qa_unlocks`, and `users.is_expert`.

## Buttons (doc.html)
- **Download** keeps its look; it now has a soft pulse and a light sweep. New **View Doc** button next to it (scrolls to the pages) with a nudging arrow and the same sweep. Both stop animating for visitors who prefer reduced motion.
