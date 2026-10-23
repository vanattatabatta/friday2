# Keep uploads (Doc Library, Static pages, users, chats) when you deploy a new zip

Everything you upload (library documents, static pages, citation docs, users, live chats) is stored in the
database folder `pglite`. On Railway a container's disk is thrown away on every deploy, so without a Volume the
database starts empty each time. Fix it once:

1. Railway > your service > **Settings > Volumes > Add Volume**, mount path `/data`.
2. **Variables**: `JWT_SECRET=<long random text>`. No database variables are needed.
   Make sure `PGLITE_FORCE_SEED` is NOT set (it wipes the database on purpose).
3. Deploy. The log must show `[DB] local PGlite database: /data/pglite`.
   If it shows `WARNING: running on Railway WITHOUT a Volume`, the Volume is not attached yet.
4. From now on deploy the new zip as often as you like: the code is replaced, `/data` is kept.

Never put `backend/data` (the database) inside the zip or in GitHub. Use Admin > Backup > Download latest database backup instead.
The `static pages/` folder is only a copy: it is rebuilt from the database at every start.
