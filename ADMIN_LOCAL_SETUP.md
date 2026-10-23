# Admin account (created locally, never in variables)

The server no longer reads ADMIN_USERNAME / ADMIN_PASSWORD. Do NOT add them to Railway or any .env.

Create or reset the admin on your own computer (it uses the same built-in database as the site):

    cd backend
    node scripts/create-admin.js

It asks for the username and the password and stores only a bcrypt hash in the admin_users table.
On start-up the server just logs whether an admin exists.

# Unlock rules (v74)
- The FIRST download of a document uses 1 unlock (earned upload unlocks first, then the paid pack). The document then stays unlocked, so downloading it again is free.
- Members on the $30/month plan never spend unlocks.
- Owners are charged as well. To let owners download their own documents free: DOC_OWNER_DOWNLOAD_FREE=1
