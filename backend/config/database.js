/*
 * Database: built-in PGlite (real PostgreSQL running inside Node.js). No separate database server is needed.
 * Data folder: backend/data/pglite  (or PGLITE_DIR, or <Railway Volume>/pglite). See README_LOCAL_DB.md.
 * Backups: the Admin > Backup tool (emailed .zip) and the live backup (Admin > Backup, every minute, downloadable).
 */
/* DATABASE_URL set  -> external PostgreSQL (Neon etc.): data lives outside the server and survives every deploy.
 * DATABASE_URL empty -> built-in PGlite folder (local development). */
const USE_EXTERNAL = !!String(process.env.DATABASE_URL || "").trim();
const pool = USE_EXTERNAL ? require("./pgAdapter").createPool() : require("./pgliteAdapter").createPool();

const query = (text, params) => pool.query(text, params);

async function initDatabase() {
  return initSchemaOnly();
}

/* creates / upgrades every table and index (safe to repeat) */
async function initSchemaOnly() {

  await query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id BIGSERIAL PRIMARY KEY,
      order_id VARCHAR(12) UNIQUE,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      subject VARCHAR(255) NOT NULL,
      deadline_date DATE NOT NULL,
      deadline_time TIME NOT NULL,
      assignment_details TEXT NOT NULL,

      client_ip VARCHAR(100),
      country VARCHAR(100),
      country_code VARCHAR(2),

      status VARCHAR(30) NOT NULL DEFAULT 'New',

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT submissions_status_check
        CHECK (
          status IN (
            'New',
            'In Progress',
            'Completed',
            'Cancelled'
          )
        )
    );
  `);

  /*
   * Add these columns to an existing submissions table.
   * Safe if they already exist.
   */
  await query(`
    ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS client_ip VARCHAR(100);
  `);

  await query(`
    ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS country VARCHAR(100);
  `);

  await query(`
    ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS submission_files (
      id BIGSERIAL PRIMARY KEY,
      submission_id BIGINT NOT NULL
        REFERENCES submissions(id)
        ON DELETE CASCADE,

      original_file_name VARCHAR(500) NOT NULL,
      stored_file_name VARCHAR(500) NOT NULL,
      file_path VARCHAR(1000) NOT NULL,
      mime_type VARCHAR(255),
      file_size BIGINT NOT NULL DEFAULT 0,
      data BYTEA NOT NULL,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  /* Admin accounts: role (main / admin / manager), email for credential mails, forced password change. Safe to re-run. */
  await query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email VARCHAR(255)");
  await query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin'");
  await query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE");
  await query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_by BIGINT");
  /* The first admin ever created is the main admin (only if nobody has that role yet). */
  await query("UPDATE admin_users SET role='main' WHERE id=(SELECT MIN(id) FROM admin_users) AND NOT EXISTS (SELECT 1 FROM admin_users WHERE role='main')");

  await query(`
    CREATE INDEX IF NOT EXISTS idx_submissions_created_at
    ON submissions(created_at DESC);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_submissions_status
    ON submissions(status);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_submission_files_submission_id
    ON submission_files(submission_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_submissions_country
    ON submissions(country);
  `);

  // Customer accounts, subscriptions and order ownership.
  await require("./userSchema").initUserTables(query);
  await require("../services/liveChatService").initTables();
  await require("../services/docService").initTables();
  await require("../services/qaService").initTables();
}

module.exports = {
  pool,
  query,
  initDatabase,
  initSchemaOnly
};