import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
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

let phaseStartedAt = Date.now();

export function getLoadingState(): LoadingState {
  return { ...state, phaseElapsedSec: Math.round((Date.now() - phaseStartedAt) / 1000) };
}

function updateState(patch: Partial<LoadingState>, logLine?: string): void {
  state = { ...state, ...patch };
  if (logLine) {
    state.log = [...state.log, logLine];
    console.log(`[DB] ${logLine}`);
  }
}

// Starts a new timed phase: resets elapsed time and ETA shown in the UI.
function setPhase(message: string, patch: Partial<LoadingState> = {}, logLine?: string): void {
  phaseStartedAt = Date.now();
  updateState({ message, etaSeconds: null, indeterminate: false, ...patch }, logLine);
}

function estimateEta(done: number, total: number, startedAt: number): number | null {
  const elapsedSec = (Date.now() - startedAt) / 1000;
  if (done <= 0 || elapsedSec < 3) return null;
  return Math.max(0, Math.round(((total - done) * elapsedSec) / done));
}

// ─── SQL in a worker thread ───────────────────────────────────────────────────
// Long-running statements (index builds, WAL checkpoints) run off the main thread
// so /api/status keeps answering and the UI can show live progress.

interface SqlStep { label: string; sql: string; pragma?: boolean }

function runSqlInWorker(
  dbPath: string,
  pragmas: string[],
  steps: SqlStep[],
  onStep: (index: number, step: SqlStep) => void,
): Promise<void> {
  const workerScript = `
    const { workerData, parentPort } = require('worker_threads');
    const Database = require('better-sqlite3');
    const db = new Database(workerData.dbPath);
    try {
      for (const p of workerData.pragmas) db.pragma(p);
      workerData.steps.forEach((s, i) => {
        parentPort.postMessage({ step: i });
        if (s.pragma) db.pragma(s.sql); else db.exec(s.sql);
      });
      db.close();
      parentPort.postMessage({ done: true });
    } catch (err) {
      try { db.close(); } catch {}
      parentPort.postMessage({ error: String(err) });
    }
  `;
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerScript, { eval: true, workerData: { dbPath, pragmas, steps } });
    worker.on('message', (msg: { step?: number; done?: boolean; error?: string }) => {
      if (msg.step !== undefined) onStep(msg.step, steps[msg.step]);
      if (msg.done)  resolve();
      if (msg.error) reject(new Error(msg.error));
    });
    worker.on('error', reject);
  });
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

let optimisationRunning = false;

function startOptimisationWorker(dbPath: string): void {
  optimisationRunning = true;
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
  worker.on('exit', () => { optimisationRunning = false; });
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

// Covering indexes are created by startOptimisationWorker in the background
// so searches are available immediately after import without waiting for them.
const INDEX_STEPS: SqlStep[] = [
  { label: 'Creating postcode index',           sql: 'CREATE INDEX IF NOT EXISTS idx_postcode       ON transactions(postcode)' },
  { label: 'Creating compact postcode index',   sql: 'CREATE INDEX IF NOT EXISTS idx_postcode_nospc ON transactions(postcode_nospc)' },
  { label: 'Creating street index',             sql: 'CREATE INDEX IF NOT EXISTS idx_street         ON transactions(street)' },
  { label: 'Creating property-key index',       sql: 'CREATE INDEX IF NOT EXISTS idx_property_key   ON transactions(property_key)' },
  { label: 'Creating year/type index',          sql: 'CREATE INDEX IF NOT EXISTS idx_year_type      ON transactions(deed_year, property_type)' },
  { label: 'Creating transaction-ID index',     sql: 'CREATE INDEX IF NOT EXISTS idx_unique_id      ON transactions(unique_id)' },
  { label: 'Running ANALYZE (query planner statistics)', sql: 'ANALYZE transactions' },
];

function openMainConnection(): BetterSqlite3.Database {
  const d = new BetterSqlite3(DB_PATH);
  d.pragma('journal_mode = WAL');
  d.pragma('cache_size = -131072'); // 128 MB page cache
  d.pragma('temp_store = MEMORY');
  d.pragma('mmap_size = 4294967296'); // 4 GB mmap
  d.pragma('busy_timeout = 10000');   // 10 s wait if write lock contention
  return d;
}

function getMeta(d: BetterSqlite3.Database, key: string): string | undefined {
  return (d.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value;
}

// Uses idx_year_type to narrow to the latest year, so it's ~ms rather than a full scan.
function getLatestTransactionDate(d: BetterSqlite3.Database): string | null {
  const row = d.prepare(
    'SELECT MAX(deed_date) AS d FROM transactions WHERE deed_year = (SELECT MAX(deed_year) FROM transactions)',
  ).get() as { d: string | null };
  return row.d;
}

function setMeta(d: BetterSqlite3.Database, key: string, value: string): void {
  d.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
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
    const dbSizeMb = Math.round(fs.statSync(DB_PATH).size / 1e6);
    setPhase(
      'Opening database…',
      { status: 'loading', mode: 'opening', progress: 5, indeterminate: true },
      `Opening existing database (${dbSizeMb.toLocaleString()} MB)…`,
    );

    let complete = false;
    try {
      db = openMainConnection();
      complete = getMeta(db, 'status') === 'complete';
    } catch (err) {
      // Never delete the DB here: it holds every merged update, and a transient
      // failure (e.g. another instance holding a lock) would silently discard them.
      try { db?.close(); } catch {}
      db = null;
      const reason = err instanceof Error ? err.message : String(err);
      updateState(
        {
          status: 'error',
          message: 'Could not open database',
          error: `Could not open ${DB_PATH}: ${reason}. If another copy of the app is running, close it and restart. ` +
                 'If the file is corrupt, delete it to rebuild from pp-fulldata.csv (merged updates would need re-applying).',
        },
        `✗ Could not open database: ${reason}`,
      );
      return;
    }

    if (complete) {
      await finishOpening(db!, dbSizeMb);
      return;
    }

    db!.close();
    db = null;
    updateState({}, '⚠ Existing database is incomplete — rebuilding from CSV');
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

  try {
    await importCsv();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    updateState({ status: 'error', message: 'Import failed', error: `Import failed: ${reason}` }, `✗ Import failed: ${reason}`);
  }
}

async function finishOpening(d: BetterSqlite3.Database, dbSizeMb: number): Promise<void> {
  // Checkpoint any large WAL file back into the main DB.
  // The background index worker writes ~GBs of WAL that often goes un-checkpointed
  // because the passive close-checkpoint can't run while this connection is open.
  // A TRUNCATE checkpoint resets the WAL to zero, so subsequent reads no longer
  // have to traverse the WAL index on every page access. It runs in a worker so
  // the status endpoint stays responsive; the idle main connection doesn't block it.
  const walPath = DB_PATH + '-wal';
  if (fs.existsSync(walPath)) {
    const walMb = Math.round(fs.statSync(walPath).size / 1e6);
    if (walMb > 50) {
      setPhase(
        `Applying ${walMb.toLocaleString()} MB of pending changes to the database file…`,
        { progress: 30, indeterminate: true },
        `⟳ Checkpointing ${walMb.toLocaleString()} MB WAL file…`,
      );
      try {
        await runSqlInWorker(DB_PATH, ['busy_timeout = 60000'], [
          { label: 'checkpoint', sql: 'wal_checkpoint(TRUNCATE)', pragma: true },
        ], () => {});
        updateState({}, `✓ WAL checkpoint complete in ${getLoadingState().phaseElapsedSec}s — reads are now faster`);
      } catch (err) {
        updateState({}, `⚠ WAL checkpoint skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  let count: number;
  if (getMeta(d, 'count_tracked') === '1') {
    count = Number(getMeta(d, 'row_count') ?? 0);
  } else {
    // One-off full count; from now on imports and merges keep row_count up to date.
    setPhase('Counting transactions (one-off)…', { progress: 70, indeterminate: true }, 'Counting transactions (one-off)…');
    await new Promise(r => setImmediate(r));
    count = (d.prepare('SELECT COUNT(*) as n FROM transactions').get() as { n: number }).n;
    setMeta(d, 'row_count', String(count));
    setMeta(d, 'count_tracked', '1');
  }

  setPhase(
    'Ready',
    { status: 'ready', progress: 100, rowsProcessed: count, latestTransactionDate: getLatestTransactionDate(d) },
    `✓ Database loaded — ${count.toLocaleString()} transactions, ${dbSizeMb.toLocaleString()} MB`,
  );
  // Kick off background optimisation if covering indexes or ANALYZE are missing
  if (needsOptimisation(d)) startOptimisationWorker(DB_PATH);
}

// ─── Import ───────────────────────────────────────────────────────────────────

async function importCsv(): Promise<void> {
  const totalBytes = fs.statSync(CSV_PATH).size;
  let bytesRead = 0;
  let rowsInserted = 0;
  let rowsSkipped = 0;

  setPhase(
    'Step 1 of 2: Reading pp-fulldata.csv…',
    { status: 'loading', mode: 'importing', progress: 0 },
    `Starting import of ${(totalBytes / 1e9).toFixed(1)} GB file…`,
  );
  const importStartedAt = Date.now();

  fs.mkdirSync(path.dirname(DB_IMPORT_PATH), { recursive: true }); // data/ is gitignored, so absent on a fresh clone
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
        const etaSeconds = estimateEta(bytesRead, totalBytes, importStartedAt);
        if (rowsInserted - lastProgressLog >= 500_000) {
          lastProgressLog = rowsInserted;
          updateState(
            { progress: pct, rowsProcessed: rowsInserted, etaSeconds },
            `  Processed ${rowsInserted.toLocaleString()} rows (${pct}%)`,
          );
        } else {
          state = { ...state, progress: pct, rowsProcessed: rowsInserted, etaSeconds };
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
    { progress: 80, rowsProcessed: rowsInserted },
    `✓ ${rowsInserted.toLocaleString()} rows inserted (${rowsSkipped.toLocaleString()} skipped). Creating indexes…`,
  );
  d.close();

  // Index builds take several minutes on the full dataset — run them in a worker
  // so progress keeps reaching the UI.
  await runSqlInWorker(
    DB_IMPORT_PATH,
    ['journal_mode = OFF', 'synchronous = OFF', 'cache_size = -524288', 'temp_store = MEMORY'],
    [
      ...INDEX_STEPS,
      { label: 'Finalising', sql: `INSERT INTO meta VALUES ('status', 'complete'), ('row_count', '${rowsInserted}'), ('count_tracked', '1')` },
    ],
    (i, step) => {
      const total = INDEX_STEPS.length + 1;
      setPhase(
        `Step 2 of 2: ${step.label} (${i + 1} of ${total})…`,
        { progress: 80 + Math.round((i / total) * 18), indeterminate: true },
        `⟳ ${step.label}…`,
      );
    },
  );

  fs.renameSync(DB_IMPORT_PATH, DB_PATH);

  db = openMainConnection();

  setPhase(
    'Ready',
    { status: 'ready', progress: 100, rowsProcessed: rowsInserted, latestTransactionDate: getLatestTransactionDate(db) },
    `✓ Import complete — ${rowsInserted.toLocaleString()} transactions ready`,
  );
}

// ─── Incremental merge ────────────────────────────────────────────────────────
// Runs as a background job so the UI can poll progress via getMergeProgress().
// Record status (last column) in LR update files: A = add, C = change, D = delete.

export interface MergeResult {
  added: number;
  updated: number;
  deleted: number;
  duplicates: number;
  skipped: number;
  dateRange: { min: string; max: string } | null;
}

export interface MergeProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number;       // 0–100
  bytesProcessed: number;
  totalBytes: number;
  rowsProcessed: number;
  elapsedSec: number;
  etaSeconds: number | null;
  result: MergeResult | null;
  error?: string;
}

let merge: MergeProgress = {
  status: 'idle', progress: 0, bytesProcessed: 0, totalBytes: 0,
  rowsProcessed: 0, elapsedSec: 0, etaSeconds: null, result: null,
};
let mergeStartedAt = 0;

export function getMergeProgress(): MergeProgress {
  if (merge.status !== 'running') return { ...merge };
  return {
    ...merge,
    elapsedSec: Math.round((Date.now() - mergeStartedAt) / 1000),
    etaSeconds: estimateEta(merge.bytesProcessed, merge.totalBytes, mergeStartedAt),
  };
}

// Throws if a merge can't start; otherwise applies the file in the background.
export function startMerge(buffer: Buffer): void {
  if (!db || state.status !== 'ready') throw new Error('Database is not ready yet.');
  if (merge.status === 'running') throw new Error('An update is already being applied.');
  if (optimisationRunning) {
    throw new Error('Background database optimisation is still running — please try again in a few minutes.');
  }

  mergeStartedAt = Date.now();
  merge = {
    status: 'running', progress: 0, bytesProcessed: 0, totalBytes: buffer.length,
    rowsProcessed: 0, elapsedSec: 0, etaSeconds: null, result: null,
  };
  console.log(`[DB] Merge started (${(buffer.length / 1e6).toFixed(1)} MB)`);

  mergeFromBuffer(buffer)
    .then(result => {
      merge = { ...getMergeProgress(), status: 'done', progress: 100, etaSeconds: 0, result };
      console.log(`[DB] Merge complete: ${JSON.stringify(result)}`);
    })
    .catch(err => {
      merge = { ...getMergeProgress(), status: 'error', etaSeconds: null, error: err instanceof Error ? err.message : String(err) };
      console.error('[DB] Merge failed:', err);
    });
}

interface PendingRow { status: string; id: string; row: Record<string, unknown> | null }

async function mergeFromBuffer(buffer: Buffer): Promise<MergeResult> {
  const d = db!;

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
  const existsStmt = d.prepare('SELECT 1 FROM transactions WHERE unique_id = ? LIMIT 1');
  const deleteStmt = d.prepare('DELETE FROM transactions WHERE unique_id = ?');

  let added = 0, updated = 0, deleted = 0, duplicates = 0, skipped = 0;
  let minDate = '', maxDate = '';

  // Rows are applied in file order so an add followed by a change/delete of the
  // same transaction within one file resolves correctly.
  const applyBatch = d.transaction((rows: PendingRow[]) => {
    for (const { status, id, row } of rows) {
      if (!row) { deleted += deleteStmt.run(id).changes; continue; }
      if (id && existsStmt.get(id)) {
        if (status === 'C') { deleteStmt.run(id); insertStmt.run(row); updated++; }
        else duplicates++;
      } else {
        insertStmt.run(row);
        added++;
      }
    }
  });

  // Feed the parser in 1 MB slices so progress can be tracked by bytes consumed.
  const SLICE = 1024 * 1024;
  function* slices(): Generator<Buffer> {
    for (let off = 0; off < buffer.length; off += SLICE) {
      merge.bytesProcessed = Math.min(off + SLICE, buffer.length);
      yield buffer.subarray(off, off + SLICE);
    }
  }
  const parser = Readable.from(slices(), { objectMode: false, highWaterMark: SLICE })
    .pipe(parse({ relax_column_count: true, skip_empty_lines: true, trim: true }));

  const BATCH = 5_000;
  let pending: PendingRow[] = [];

  async function flush(): Promise<void> {
    applyBatch(pending);
    merge.rowsProcessed += pending.length;
    merge.progress = Math.min(99, Math.round((merge.bytesProcessed / merge.totalBytes) * 100));
    pending = [];
    await new Promise(r => setImmediate(r)); // let status polls and searches through
  }

  for await (const cols of parser as AsyncIterable<string[]>) {
    const status = (cols[C.STATUS] || '').toUpperCase();
    const guid   = (cols[C.UID] || '').replace(/[{}]/g, '').toUpperCase();

    if (status === 'D') {
      if (guid) pending.push({ status, id: guid, row: null });
      else skipped++;
    } else {
      const rawPrice = cols[C.PRICE]?.replace(/[£,]/g, '');
      const price = parseInt(rawPrice, 10);
      if (!price || price <= 0) { skipped++; continue; }

      const deedDate = parseDate(cols[C.DATE] || '');
      if (!deedDate || deedDate.length < 4) { skipped++; continue; }
      const deedYear = parseInt(deedDate.substring(0, 4), 10);

      const rawPostcode = (cols[C.POSTCODE] || '').trim();
      if (!rawPostcode) { skipped++; continue; }
      const postcode = normalisePostcode(rawPostcode);
      const postcodeNospc = postcode.replace(/\s+/g, '').toUpperCase();

      const paon     = (cols[C.PAON]     || '').trim();
      const saon     = (cols[C.SAON]     || '').trim();
      const street   = (cols[C.STREET]   || '').trim();
      const locality = (cols[C.LOCALITY] || '').trim();
      const town     = (cols[C.TOWN]     || '').trim();
      const district = (cols[C.DISTRICT] || '').trim();
      const county   = (cols[C.COUNTY]   || '').trim();

      if (!minDate || deedDate < minDate) minDate = deedDate;
      if (!maxDate || deedDate > maxDate) maxDate = deedDate;

      pending.push({
        status,
        id: guid,
        row: {
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
        },
      });
    }

    if (pending.length >= BATCH) await flush();
  }
  if (pending.length > 0) await flush();

  const rowCount = Number(getMeta(d, 'row_count') ?? 0) + added - deleted;
  setMeta(d, 'row_count', String(rowCount));
  state = { ...state, rowsProcessed: rowCount, latestTransactionDate: getLatestTransactionDate(d) };

  return {
    added,
    updated,
    deleted,
    duplicates,
    skipped,
    dateRange: minDate ? { min: minDate, max: maxDate } : null,
  };
}
