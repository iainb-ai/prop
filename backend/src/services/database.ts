import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream } from 'fs';
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

function needsOptimisation(d: BetterSqlite3.Database): boolean {
  const idx = d.prepare(
    "SELECT COUNT(*) as n FROM sqlite_master WHERE type='index' AND name='idx_postcode_nospc_cover'",
  ).get() as { n: number };
  if (idx.n === 0) return true;

  try {
    const stats = d.prepare('SELECT COUNT(*) as n FROM sqlite_stat1').get() as { n: number };
    return stats.n === 0;
  } catch {
    return true; // sqlite_stat1 may not exist if ANALYZE was never run
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
      parentPort.postMessage({ log: 'Creating covering index (postcode_nospc)…' });
      db.exec('CREATE INDEX IF NOT EXISTS idx_postcode_nospc_cover ON transactions(postcode_nospc, deed_year, property_type, price_paid)');
      parentPort.postMessage({ log: 'Creating covering index (postcode)…' });
      db.exec('CREATE INDEX IF NOT EXISTS idx_postcode_cover ON transactions(postcode, deed_year, property_type, price_paid)');
      parentPort.postMessage({ log: 'Running ANALYZE — query planner will use indexes correctly after this…' });
      db.exec('ANALYZE transactions');
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
    -- Covering indexes: avoid table row lookups for the trend aggregation query
    CREATE INDEX IF NOT EXISTS idx_postcode_nospc_cover
      ON transactions(postcode_nospc, deed_year, property_type, price_paid);
    CREATE INDEX IF NOT EXISTS idx_postcode_cover
      ON transactions(postcode, deed_year, property_type, price_paid);
  `);
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
        db.pragma('temp_store = MEMORY');  // keep temp tables (window fn sort buffers) in RAM
        db.pragma('mmap_size = 17179869184'); // 16 GB mmap — let OS cache the file
        const count = countRow.n;
        updateState(
          { status: 'ready', progress: 100, rowsProcessed: count },
          `✓ Existing database loaded — ${count.toLocaleString()} transactions`,
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
  d.pragma('journal_mode = WAL');
  d.pragma('synchronous = OFF');
  d.pragma('cache_size = -262144'); // 256 MB
  d.pragma('temp_store = MEMORY');

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

  const BATCH = 50_000;
  let batch: Record<string, unknown>[] = [];

  const flush = d.transaction((rows: Record<string, unknown>[]) => {
    for (const r of rows) insertStmt.run(r);
  });

  let lastProgressLog = 0;

  await new Promise<void>((resolve, reject) => {
    const readStream = createReadStream(CSV_PATH, { highWaterMark: 1024 * 1024 });
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
  db.pragma('mmap_size = 17179869184');

  updateState(
    { status: 'ready', progress: 100, rowsProcessed: rowsInserted, message: 'Ready' },
    `✓ Import complete — ${rowsInserted.toLocaleString()} transactions ready`,
  );
}
