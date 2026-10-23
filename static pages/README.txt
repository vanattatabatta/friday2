STATIC PAGES FOLDER
-------------------
Every static page created from the admin panel (Admin > Static pages) is saved here as  <url-name>.html
(example: database-expert-help.html).  Only admin-created pages are stored here.

- Saving a page again rewrites its file; deleting a page removes its file.
- On every server start, missing or changed files are rewritten from the database.
- This folder is NOT served directly (/static pages/... returns 404). Pages go live only at their clean URL, e.g. /database-expert-help.
- The database stays the master copy (hosts like Railway wipe the disk on each deploy), so edit pages in the admin, not here.
