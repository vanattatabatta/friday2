// Merge all public tables from SRC_URL into DST_URL on Neon.
// Existing rows in the destination are kept (ON CONFLICT DO NOTHING).
// node neon-merge.js            -> dry run, prints row counts only
// node neon-merge.js --apply    -> actually copies
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const SRC_URL = process.env.SRC_URL;
const DST_URL = process.env.DST_URL;
if (!SRC_URL || !DST_URL) {
  console.error('Set SRC_URL and DST_URL environment variables first.');
  process.exit(1);
}
if (SRC_URL === DST_URL) {
  console.error('SRC_URL and DST_URL are identical. Aborting.');
  process.exit(1);
}

const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';

async function tables(c) {
  const r = await c.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' order by 1`
  );
  return r.rows.map((x) => x.table_name);
}

async function columns(c, t) {
  const r = await c.query(
    `select column_name, data_type, is_generated, identity_generation
     from information_schema.columns
     where table_schema='public' and table_name=$1 order by ordinal_position`,
    [t]
  );
  return r.rows;
}

// Order tables so parents are copied before children (foreign keys).
async function fkOrder(c, names) {
  const r = await c.query(
    `select cl.relname as child, pl.relname as parent
     from pg_constraint k
     join pg_class cl on cl.oid = k.conrelid
     join pg_class pl on pl.oid = k.confrelid
     join pg_namespace n on n.oid = cl.relnamespace
     where k.contype='f' and n.nspname='public' and cl.relname <> pl.relname`
  );
  const deps = new Map(names.map((n) => [n, new Set()]));
  for (const { child, parent } of r.rows)
    if (deps.has(child) && deps.has(parent)) deps.get(child).add(parent);
  const out = [];
  const done = new Set();
  while (out.length < names.length) {
    let progressed = false;
    for (const n of names) {
      if (done.has(n)) continue;
      if ([...deps.get(n)].every((p) => done.has(p))) {
        out.push(n);
        done.add(n);
        progressed = true;
      }
    }
    if (!progressed) {
      for (const n of names) if (!done.has(n)) { out.push(n); done.add(n); }
    }
  }
  return out;
}

async function main() {
  const src = new Client({ connectionString: SRC_URL });
  const dst = new Client({ connectionString: DST_URL });
  await src.connect();
  await dst.connect();
  console.log(APPLY ? 'MODE: APPLY (writing to destination)' : 'MODE: DRY RUN (no writes). Use --apply to copy.');

  const srcTables = await tables(src);
  const dstTables = new Set(await tables(dst));
  const order = await fkOrder(src, srcTables);

  let totalInserted = 0;
  for (const t of order) {
    if (!dstTables.has(t)) {
      console.log(`SKIP  ${t}: table does not exist in destination (create the schema first)`);
      continue;
    }
    const sCols = await columns(src, t);
    const dCols = await columns(dst, t);
    const dMap = new Map(dCols.map((c) => [c.column_name, c]));
    const cols = sCols.filter((c) => {
      const d = dMap.get(c.column_name);
      return d && d.is_generated !== 'ALWAYS';
    });
    if (!cols.length) { console.log(`SKIP  ${t}: no common columns`); continue; }

    const total = Number((await src.query(`select count(*) from ${q(t)}`)).rows[0].count);
    const before = Number((await dst.query(`select count(*) from ${q(t)}`)).rows[0].count);
    if (!APPLY) {
      console.log(`${t}: source ${total} rows, destination ${before} rows`);
      continue;
    }
    if (!total) { console.log(`${t}: empty, nothing to copy`); continue; }

    const names = cols.map((c) => q(c.column_name)).join(', ');
    const isJson = cols.map((c) => c.data_type === 'json' || c.data_type === 'jsonb');
    const hasIdentityAlways = cols.some((c) => dMap.get(c.column_name).identity_generation === 'ALWAYS');
    const batch = Math.max(1, Math.min(500, Math.floor(60000 / cols.length)));

    for (let off = 0; off < total; off += batch) {
      const rows = (await src.query(
        `select ${names} from ${q(t)} order by ctid limit ${batch} offset ${off}`
      )).rows;
      if (!rows.length) break;
      const params = [];
      const tuples = rows.map((row) => {
        const ph = cols.map((c, i) => {
          let v = row[c.column_name];
          if (v !== null && isJson[i]) v = JSON.stringify(v);
          params.push(v);
          return '$' + params.length;
        });
        return '(' + ph.join(', ') + ')';
      });
      await dst.query(
        `insert into ${q(t)} (${names}) ${hasIdentityAlways ? 'overriding system value ' : ''}values ${tuples.join(', ')} on conflict do nothing`,
        params
      );
    }
    const after = Number((await dst.query(`select count(*) from ${q(t)}`)).rows[0].count);
    totalInserted += after - before;
    console.log(`${t}: source ${total}, destination ${before} -> ${after} (+${after - before})`);
  }

  if (APPLY) {
    const seqs = await dst.query(
      `select c.relname as t, a.attname as col,
              pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) as seq
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where c.relkind='r' and n.nspname='public'
         and pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null`
    );
    for (const { t, col, seq } of seqs.rows) {
      await dst.query(
        `select setval($1, coalesce((select max(${q(col)}) from ${q(t)}), 1), (select count(*) > 0 from ${q(t)}))`,
        [seq]
      );
    }
    console.log(`Sequences reset: ${seqs.rowCount}. Total new rows inserted: ${totalInserted}`);
  }

  await src.end();
  await dst.end();
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});