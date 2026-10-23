# Part 3d changes (doc library)

- No confirm popups: Download and View Doc act immediately (both confirm() dialogs removed).
- Snippet box removed (page text still exists in the pages, blurred, for search engines).
- Unlock bar is now sticky: it follows the reader while the document scrolls, bottom edge at 85% of the screen height
  (`--barbot:15vh` in `<style id="bar-pos">`), and rests after the last page.
- Every page, page 1 included, shows only the top 25% of the PAGE box (A4 ratio); the rest is blurred (DOC_CLEAR_RATIO).
- View Doc: with an unlock available it unlocks and opens the document; otherwise it opens the unlock options.
  Download: with an unlock available it unlocks and then downloads the file straight away.
- Unlocks: at least 5 qualifying uploads (3+ pages, not duplicates) are needed for a batch of 5 unlocks. The env
  DOC_UPLOADS_FOR_FREE can raise this but never go below 5.
- Upload: no limit on how many files (was 10), 3 files at a time (was 1), pages saved 4 at a time,
  upload rate limit raised to 1000 requests / 5 min per IP (UPLOAD_MAX_REQUESTS).
