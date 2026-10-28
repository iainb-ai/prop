import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream } from 'fs';
import { PassThrough } from 'stream';
import { Worker } from 'worker_threads';
import { parse } from 'csv-parse';
import { LoadingState } from '../types';

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.join(__dirname, '../../../');
export const CSV_PATH = path.join(PROJECT_ROOT, 'pp-fulldata.csv');
export const DB_PATH  = path.join(PROJECT_ROOT, 'data', 'pp-data.sqlite');
const DB_IMPORT_PATH  = DB_PATH + '.importing';

// ─── Column indices in the no-header LR bulk download ─────────────────────────
// unique_id | price | date | postcode | type | new_build | tenure
// | paon | saon | street | locality | town | district | county | category | status
const C = {
  UID: 0, PRICE: 1, DATE: 2, POSTCODE: 3, TYPE: 4,
  NEW_BUILD: 5, TENURE: 6, PAON: 7, SAON: 8, STREET: 9,
  LOCALITY: 10, TOWN: 11, DISTRICT: 12, COUNTY: 13,
  CATEGORY: 14, STATUS: 15,
};

// ─── Loading state ─────────────────────────────────────────────────────────────

let state: LoadingState = {
  status: 'idle', progress: 0, rowsProcessed: 0,
  message: 'Starting up…', log: [],
};

export function getLoadingState(): LoadingState { return { ...state }; }

function updateState(patch: Partial<LoadingState>, logLine?: string): void {
  state = { ...state, ...patch };
  if (logLine) {
    state.log = [...state.log, logLine];
    console.log(`[DB] ${logLine}`);
  }
}

// ─── Background optimisation (covering indexes + ANALYZE) ─────────────────────
// Runs in a Worker thread so the main event loop stays free for HTTP requests.
// SQLite WAL mode allows concurrent reads while the worker holds the write lock.

const REQUIRED_INDEXES = [
  'idx_postcode_nospc_cover',
  'idx_postcode_nospc_pkey',
  'idx_postcode_pkey',
];

function needsOptimisation(d: BetterSqlite3.Database): boolean {
  for (const name of REQUIRED_INDEXES) {
    const row = d.prepare(
      "SELECT COUNT(*) as n FROM sqlite_master WHERE type='index' AND name=?",
    ).get(name) as { n: number };
    if (row.n === 0) return true;
  }
  try {
    const stats = d.prepare('SELECT COUNT(*) as n FROM sqlite_stat1').get() as { n: number };
    return stats.n === 0;
  } catch {
    return true;
  }
}

function startOptimisationWorker(dbPath: string): void {
  updateState({}, '⟳ Running background optimisation (covering indexes + ANALYZE) — searches available now');

  // Inline Worker script — pure JS so no TypeScript compilation needed.
  // require() resolves relative to the process cwd which includes node_modules.
  const workerScript = `
    const { workerData, parentPort } = require('worker_threads');
    const Database = require('better-sqlite3');
    const db = new Database(workerData.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 120000'); // 2 min — wait if main thread briefly blocks write
    try {
      parentPort.postMessage({ log: 'Creating covering index (postcode_nospc, deed_year, type, price)…' });
      db.exec('CREATE INDEX IF NOT EXISTS idx_postcode_nospc_cover ON transactions(postcode_nospc, deed_year, property_type, price_paid)');
      parentPort.postMessage({ log: 'Creating covering index (postcode, deed_year, type, price)…' });
      db.exec('CREATE INDEX IF NOT EXISTS idx_postcode_cover ON transactions(postcode, deed_year, property_type, price_paid)');
      parentPort.postMessage({ log: 'Creating property-key lookup index (postcode_nospc, property_key)…' });
      db.exec('CREATE INDEX IF NOT EXISTS idx_postcode_nospc_pkey ON transactions(postcode_nospc, property_key)');
      parentPort.postMessage({ log: 'Creating property-key lookup index (postcode, property_key)…' });
      db.exec('CREATE INDEX IF NOT EXISTS idx_postcode_pkey ON transactions(postcode, property_key)');
      parentPort.postMessage({ log: 'Running ANALYZE — query planner will use indexes correctly after this…' });
      db.exec('ANALYZE transactions');
      parentPort.postMessage({ log: 'Checkpointing WAL — merging index pages into main DB file…' });
      db.pragma('wal_checkpoint(RESTART)');
      db.close();
      parentPort.postMessage({ done: true });
    } catch (err) {
      try { db.close(); } catch {}
      parentPort.postMessage({ error: String(err) });
    }
  `;

  const worker = new Worker(workerScript, { eval: true, workerData: { dbPath } });
  worker.on('message', (msg: { log?: string; done?: boolean; error?: string }) => {
    if (msg.log)   updateState({}, `⟳ Optimisation: ${msg.log}`);
    if (msg.done)  updateState({}, '✓ Optimisation complete — subsequent searches will be faster');
    if (msg.error) updateState({}, `⚠ Background optimisation error: ${msg.error}`);
  });
  worker.on('error', err => console.error('[Optimisation worker]', err));
}

// ─── DB handle ────────────────────────────────────────────────────────────────

let db: BetterSqlite3.Database | null = null;

export function getDb(): BetterSqlite3.Database {
  if (!db) throw new Error('Database not initialised');
  return db;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function createSchema(d: BetterSqlite3.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      unique_id          TEXT,
      price_paid         INTEGER NOT NULL,
      deed_date          TEXT    NOT NULL,
      deed_year          INTEGER NOT NULL,
      postcode           TEXT    NOT NULL,
      postcode_nospc     TEXT    NOT NULL,
      property_type      TEXT    NOT NULL,
      new_build          INTEGER NOT NULL,
      estate_type        TEXT    NOT NULL,
      paon               TEXT,
      saon               TEXT,
      street             TEXT,
      locality           TEXT,
      town               TEXT,
      district_name      TEXT,
      county             TEXT,
      transaction_category TEXT,
      property_key       TEXT    NOT NULL,
      display_address    TEXT    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function createIndexes(d: BetterSqlite3.Database): void {
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_postcode       ON transactions(postcode);
    CREATE INDEX IF NOT EXISTS idx_postcode_nospc ON transactions(postcode_nospc);
    CREATE INDEX IF NOT EXISTS idx_street         ON transactions(street);
    CREATE INDEX IF NOT EXISTS idx_property_key   ON transactions(property_key);
    CREATE INDEX IF NOT EXISTS idx_year_type      ON transactions(deed_year, property_type);
    CREATE INDEX IF NOT EXISTS idx_unique_id      ON transactions(unique_id);
  `);
  // Covering indexes are created by startOptimisationWorker in the background
  // so searches are available immediately after import without waiting for them.
}

// ─── Row helpers ───────────────────────────────────────────────────────────────

function normalisePostcode(raw: string): string {
  const u = raw.toUpperCase().replace(/\s+/g, '');
  if (u.length < 4) return u;
  return u.slice(0, u.length - 3) + ' ' + u.slice(u.length - 3);
}

function buildPropertyKey(postcode: string, saon: string, paon: string, street: string, town: string): string {
  return [postcode, saon, paon, street, town]
    .map(s => s.toUpperCase().replace(/\s+/g, ' ').trim())
    .join('|');
}

function buildDisplayAddress(saon: string, paon: string, street: string, locality: string, town: string, postcode: string): string {
  return [saon, paon, street, locality, town, postcode].filter(Boolean).join(', ');
}

function parseDate(raw: string): string {
  // "YYYY-MM-DD HH:MM" or "YYYY-MM-DD" → "YYYY-MM-DD"
  return raw.split(' ')[0].split('T')[0];
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  // Check for complete DB
  if (fs.existsSync(DB_PATH)) {
    try {
      const tmp = new BetterSqlite3(DB_PATH, { readonly: true });
      const row = tmp.prepare("SELECT value FROM meta WHERE key = 'status'").get() as { value: string } | undefined;
      const countRow = tmp.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number };
      tmp.close();

      if (row?.value === 'complete') {
        db = new BetterSqlite3(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('cache_size = -131072'); // 128 MB page cache
        db.pragma('temp_store = MEMORY');
        db.pragma('mmap_size = 4294967296'); // 4 GB mmap
        db.pragma('busy_timeout = 10000');   // 10 s wait if write lock contention

        // Checkpoint any large WAL file back into the main DB.
        // The background index worker writes ~GBs of WAL that often goes un-checkpointed
        // because the passive close-checkpoint can't run while this connection is open.
        // A TRUNCATE checkpoint blocks briefly then resets the WAL to zero, so subsequent
        // reads no longer have to traverse the WAL index on every page access.
        const walPath = DB_PATH + '-wal';
        if (fs.existsSync(walPath)) {
          const walMb = Math.round(fs.statSync(walPath).size / 1e6);
          if (walMb > 50) {
            updateState({}, `⟳ Checkpointing ${walMb} MB WAL file — this may take a few seconds…`);
            db.pragma('wal_checkpoint(TRUNCATE)');
            updateState({}, '✓ WAL checkpoint complete — reads are now faster');
          }
        }

        const count = countRow.n;
        const dbSizeMb = Math.round(require('fs').statSync(DB_PATH).size / 1e6);
        updateState(
          { status: 'ready', progress: 100, rowsProcessed: count },
          `✓ Database loaded — ${count.toLocaleString()} transactions, ${dbSizeMb} MB`,
        );
        // Kick off background optimisation if covering indexes or ANALYZE are missing
        if (needsOptimisation(db)) startOptimisationWorker(DB_PATH);
        return;
      }
    } catch {
      fs.unlinkSync(DB_PATH);
    }
  }

  // Clean up any abandoned import
  if (fs.existsSync(DB_IMPORT_PATH)) {
    fs.unlinkSync(DB_IMPORT_PATH);
    updateState({}, '⚠ Previous import was incomplete — restarting');
  }

  if (!fs.existsSync(CSV_PATH)) {
    updateState(
      { status: 'error', message: `CSV file not found at ${CSV_PATH}` },
      `✗ Cannot find pp-fulldata.csv at ${CSV_PATH}`,
    );
    return;
  }

  await importCsv();
}

// ─── Import ───────────────────────────────────────────────────────────────────

async function importCsv(): Promise<void> {
  const totalBytes = fs.statSync(CSV_PATH).size;
  let bytesRead = 0;
  let rowsInserted = 0;
  let rowsSkipped = 0;

  updateState(
    { status: 'loading', progress: 0, message: 'Importing CSV…' },
    `Starting import of ${(totalBytes / 1e9).toFixed(1)} GB file…`,
  );

  const d = new BetterSqlite3(DB_IMPORT_PATH);
  // page_size must be set before the first write (before createSchema).
  // 65536-byte pages reduce I/O depth on a large DB; has no effect if the file
  // already contains data (safe to leave in place for re-runs).
  d.pragma('page_size = 65536');
  // journal_mode OFF is safe here: DB_IMPORT_PATH is a throw-away temp file.
  // If the process crashes we delete it and restart; no WAL overhead at all.
  d.pragma('journal_mode = OFF');
  d.pragma('synchronous = OFF');
  d.pragma('locking_mode = EXCLUSIVE');
  d.pragma('cache_size = -524288'); // 512 MB
  d.pragma('temp_store = MEMORY');
  d.pragma('mmap_size = 4294967296'); // 4 GB

  createSchema(d);

  const insertStmt = d.prepare(`
    INSERT INTO transactions
      (unique_id, price_paid, deed_date, deed_year, postcode, postcode_nospc,
       property_type, new_build, estate_type, paon, saon, street, locality,
       town, district_name, county, transaction_category, property_key, display_address)
    VALUES
      (@unique_id, @price_paid, @deed_date, @deed_year, @postcode, @postcode_nospc,
       @property_type, @new_build, @estate_type, @paon, @saon, @street, @locality,
       @town, @district_name, @county, @transaction_category, @property_key, @display_address)
  `);

  const BATCH = 200_000;
  let batch: Record<string, unknown>[] = [];

  const flush = d.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) insertStmt.run(r);
  });

  let lastProgressLog = 0;

  await new Promise<void>((resolve, reject) => {
    const readStream = createReadStream(CSV_PATH, { highWaterMark: 16 * 1024 * 1024 });
    readStream.on('data', (chunk: Buffer | string) => { bytesRead += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk); });

    const parser = readStream.pipe(
      parse({ relax_column_count: true, skip_empty_lines: true, trim: true }),
    );

    parser.on('data', (cols: string[]) => {
      // Skip deleted records
      if (cols[C.STATUS] === 'D') { rowsSkipped++; return; }

      const rawPrice = cols[C.PRICE]?.replace(/[£,]/g, '');
      const price = parseInt(rawPrice, 10);
      if (!price || price <= 0) { rowsSkipped++; return; }

      const rawDate = cols[C.DATE] || '';
      const deedDate = parseDate(rawDate);
      if (!deedDate || deedDate.length < 4) { rowsSkipped++; return; }
      const deedYear = parseInt(deedDate.substring(0, 4), 10);

      const rawPostcode = (cols[C.POSTCODE] || '').trim();
      if (!rawPostcode) { rowsSkipped++; return; }
      const postcode = normalisePostcode(rawPostcode);
      const postcodeNospc = postcode.replace(/\s+/g, '').toUpperCase();

      const paon  = (cols[C.PAON]  || '').trim();
      const saon  = (cols[C.SAON]  || '').trim();
      const street   = (cols[C.STREET]   || '').trim();
      const locality = (cols[C.LOCALITY] || '').trim();
      const town     = (cols[C.TOWN]     || '').trim();
      const district = (cols[C.DISTRICT] || '').trim();
      const county   = (cols[C.COUNTY]   || '').trim();

      const rawUid = (cols[C.UID] || '').trim();
      const guid = rawUid.replace(/[{}]/g, '').toUpperCase();

      batch.push({
        unique_id:            guid,
        price_paid:           price,
        deed_date:            deedDate,
        deed_year:            deedYear,
        postcode,
        postcode_nospc:       postcodeNospc,
        property_type:        (cols[C.TYPE] || 'O').trim().toUpperCase(),
        new_build:            (cols[C.NEW_BUILD] || '').trim().toUpperCase() === 'Y' ? 1 : 0,
        estate_type:          (cols[C.TENURE] || 'F').trim().toUpperCase() === 'L' ? 'L' : 'F',
        paon,
        saon,
        street,
        locality,
        town,
        district_name:        district,
        county,
        transaction_category: (cols[C.CATEGORY] || '').trim(),
        property_key:         buildPropertyKey(postcode, saon, paon, street, town),
        display_address:      buildDisplayAddress(saon, paon, street, locality, town, postcode),
      });

      if (batch.length >= BATCH) {
        flush(batch);
        rowsInserted += batch.length;
        batch = [];

        const pct = Math.min(78, Math.round((bytesRead / totalBytes) * 80));
        if (rowsInserted - lastProgressLog >= 500_000) {
          lastProgressLog = rowsInserted;
          updateState(
            { progress: pct, rowsProcessed: rowsInserted, message: `Importing… ${rowsInserted.toLocaleString()} rows` },
            `  Processed ${rowsInserted.toLocaleString()} rows (${pct}%)`,
          );
        } else {
          state = { ...state, progress: pct, rowsProcessed: rowsInserted };
        }
      }
    });

    parser.on('end', () => {
      if (batch.length > 0) { flush(batch); rowsInserted += batch.length; batch = []; }
      resolve();
    });
    parser.on('error', reject);
    readStream.on('error', reject);
  });

  updateState(
    { progress: 80, message: 'Creating indexes…' },
    `✓ ${rowsInserted.toLocaleString()} rows inserted (${rowsSkipped.toLocaleString()} skipped). Creating indexes…`,
  );

  createIndexes(d);
  updateState({ progress: 90 }, '✓ Indexes created. Running ANALYZE (query planner statistics)…');

  d.exec('ANALYZE transactions');
  updateState({ progress: 95 }, '✓ ANALYZE complete');

  d.prepare("INSERT INTO meta VALUES ('status', 'complete')").run();
  d.prepare("INSERT INTO meta VALUES ('row_count', ?)").run(String(rowsInserted));
  d.close();

  fs.renameSync(DB_IMPORT_PATH, DB_PATH);

  db = new BetterSqlite3(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('cache_size = -131072');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 4294967296');
  db.pragma('busy_timeout = 10000');

  updateState(
    { status: 'ready', progress: 100, rowsProcessed: rowsInserted, message: 'Ready' },
    `✓ Import complete — ${rowsInserted.toLocaleString()} transactions ready`,
  );
}

// ─── Incremental merge ────────────────────────────────────────────────────────

export interface MergeResult {
  added: number;
  duplicates: number;
  skipped: number;
  dateRange: { min: string; max: string } | null;
}

export async function mergeFromBuffer(buffer: Buffer): Promise<MergeResult> {
  if (!db) throw new Error('Database not initialised');

  const insertStmt = db.prepare(`
    INSERT INTO transactions
      (unique_id, price_paid, deed_date, deed_year, postcode, postcode_nospc,
       property_type, new_build, estate_type, paon, saon, street, locality,
       town, district_name, county, transaction_category, property_key, display_address)
    VALUES
      (@unique_id, @price_paid, @deed_date, @deed_year, @postcode, @postcode_nospc,
       @property_type, @new_build, @estate_type, @paon, @saon, @street, @locality,
       @town, @district_name, @county, @transaction_category, @property_key, @display_address)
  `);

  const flushInsert = db.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) insertStmt.run(r);
  });

  let added = 0, duplicates = 0, skipped = 0;
  let minDate = '', maxDate = '';

  const PARSE_BATCH = 10_000;
  let pending: Record<string, unknown>[] = [];

  function dedupAndInsert(rows: Record<string, unknown>[]): void {
    const existingIds = new Set<string>();
    const withIds = rows.filter(r => r.unique_id);
    const CHUNK = 900;
    for (let i = 0; i < withIds.length; i += CHUNK) {
      const ids = withIds.slice(i, i + CHUNK).map(r => r.unique_id as string);
      const placeholders = ids.map(() => '?').join(',');
      const found = db!
        .prepare(`SELECT unique_id FROM transactions WHERE unique_id IN (${placeholders})`)
        .all(ids) as { unique_id: string }[];
      for (const f of found) existingIds.add(f.unique_id);
    }
    const newRows = rows.filter(r => !r.unique_id || !existingIds.has(r.unique_id as string));
    duplicates += rows.length - newRows.length;
    if (newRows.length > 0) {
      flushInsert(newRows);
      added += newRows.length;
    }
  }

  await new Promise<void>((resolve, reject) => {
    const pt = new PassThrough();
    const parser = pt.pipe(
      parse({ relax_column_count: true, skip_empty_lines: true, trim: true }),
    );

    parser.on('data', (cols: string[]) => {
      if (cols[C.STATUS] === 'D') { skipped++; return; }

      const rawPrice = cols[C.PRICE]?.replace(/[£,]/g, '');
      const price = parseInt(rawPrice, 10);
      if (!price || price <= 0) { skipped++; return; }

      const deedDate = parseDate(cols[C.DATE] || '');
      if (!deedDate || deedDate.length < 4) { skipped++; return; }
      const deedYear = parseInt(deedDate.substring(0, 4), 10);

      const rawPostcode = (cols[C.POSTCODE] || '').trim();
      if (!rawPostcode) { skipped++; return; }
      const postcode = normalisePostcode(rawPostcode);
      const postcodeNospc = postcode.replace(/\s+/g, '').toUpperCase();

      const paon     = (cols[C.PAON]     || '').trim();
      const saon     = (cols[C.SAON]     || '').trim();
      const street   = (cols[C.STREET]   || '').trim();
      const locality = (cols[C.LOCALITY] || '').trim();
      const town     = (cols[C.TOWN]     || '').trim();
      const district = (cols[C.DISTRICT] || '').trim();
      const county   = (cols[C.COUNTY]   || '').trim();
      const guid     = (cols[C.UID]      || '').trim().replace(/[{}]/g, '').toUpperCase();

      if (!minDate || deedDate < minDate) minDate = deedDate;
      if (!maxDate || deedDate > maxDate) maxDate = deedDate;

      pending.push({
        unique_id:            guid,
        price_paid:           price,
        deed_date:            deedDate,
        deed_year:            deedYear,
        postcode,
        postcode_nospc:       postcodeNospc,
        property_type:        (cols[C.TYPE]      || 'O').trim().toUpperCase(),
        new_build:            (cols[C.NEW_BUILD] || '').trim().toUpperCase() === 'Y' ? 1 : 0,
        estate_type:          (cols[C.TENURE]    || 'F').trim().toUpperCase() === 'L' ? 'L' : 'F',
        paon, saon, street, locality, town,
        district_name:        district,
        county,
        transaction_category: (cols[C.CATEGORY] || '').trim(),
        property_key:         buildPropertyKey(postcode, saon, paon, street, town),
        display_address:      buildDisplayAddress(saon, paon, street, locality, town, postcode),
      });

      if (pending.length >= PARSE_BATCH) {
        dedupAndInsert(pending);
        pending = [];
      }
    });

    parser.on('end', () => {
      if (pending.length > 0) { dedupAndInsert(pending); pending = []; }
      resolve();
    });
    parser.on('error', reject);

    pt.end(buffer);
  });

  return {
    added,
    duplicates,
    skipped,
    dateRange: minDate ? { min: minDate, max: maxDate } : null,
  };
}
