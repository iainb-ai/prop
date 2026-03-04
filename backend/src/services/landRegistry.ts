/**
 * HM Land Registry Price Paid Linked Data API client.
 * Docs: http://landregistry.data.gov.uk/app/doc/ppd/
 */

import axios, { AxiosError } from 'axios';
import type { LdaItem, LdaResponse, SparqlRow, SparqlResponse, Address, Transaction, PropertyTypeCode, EstateTypeCode } from '../types';

const BASE_URL = 'https://landregistry.data.gov.uk';
const PAGE_SIZE = 100;
const MAX_PAGES = 10; // hard cap: 1000 transactions max before partial flag
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAYS = [500, 1500, 3000];

// SPARQL endpoint settings (used for partial postcode and street searches)
const SPARQL_ENDPOINT = '/landregistry/query';
const SPARQL_CAP = 1000; // max transactions returned before partial flag
const SPARQL_TIMEOUT_MS = 45_000; // generous timeout for large SPARQL queries

const SPARQL_PREFIXES = `PREFIX ppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>`;

const SPARQL_SELECT = `SELECT ?transaction ?address ?paon ?saon ?street ?town ?postcode ?price ?date ?propertyType ?newBuild ?estateType`;

const SPARQL_WHERE_CORE = `{
  ?transaction ppi:propertyAddress ?address ;
               ppi:pricePaid ?price ;
               ppi:transactionDate ?date ;
               ppi:propertyType ?propertyType ;
               ppi:newBuild ?newBuild ;
               ppi:estateType ?estateType .
  ?address lrcommon:postcode ?postcode ;
           lrcommon:paon ?paon ;
           lrcommon:street ?street ;
           lrcommon:town ?town .
  OPTIONAL { ?address lrcommon:saon ?saon }`;

// ── HTTP client ──────────────────────────────────────────────────────────────

const client = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

async function fetchWithRetry<T>(url: string, params: Record<string, string | number>): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const { data } = await client.get<T>(url, { params });
      return data;
    } catch (err) {
      const axErr = err as AxiosError;
      if (axErr.response?.status === 429 || (axErr.response?.status ?? 0) >= 500) {
        lastError = axErr;
        if (attempt < RETRY_DELAYS.length) {
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError!;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Normalisation helpers ────────────────────────────────────────────────────

function normalisePostcode(raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  // If looks like a full postcode (ends with digit+letter+letter), ensure space before last 3
  const m = upper.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]}` : upper;
}

function coercePropertyType(val: unknown): PropertyTypeCode {
  // API returns { _about: "http://.../def/common/flat-maisonette", label: [...] }
  const raw = typeof val === 'string' ? val : (val as { '_about'?: string } | null)?.['_about'] ?? '';
  const lower = raw.toLowerCase();
  // Check semi-detached BEFORE detached to avoid false match
  if (lower.includes('semi-detached') || lower.includes('semidetached')) return 'S';
  if (lower.includes('detached')) return 'D';
  if (lower.includes('terraced')) return 'T';
  if (lower.includes('flat') || lower.includes('maisonette')) return 'F';
  // Single-letter codes passed directly
  const code = raw.toUpperCase().trim();
  if (code === 'D') return 'D';
  if (code === 'S') return 'S';
  if (code === 'T') return 'T';
  if (code === 'F') return 'F';
  return 'O';
}

function coerceEstateType(val: unknown): EstateTypeCode {
  // API returns { _about: "http://.../def/common/leasehold", label: [...] }
  const raw = typeof val === 'string' ? val : (val as { '_about'?: string } | null)?.['_about'] ?? '';
  return raw.toLowerCase().includes('leasehold') ? 'L' : 'F';
}

function coerceNewBuild(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  return String(val).toLowerCase() === 'y' || String(val).toLowerCase() === 'true';
}

function extractAddressId(item: LdaItem): string {
  // API uses _about (not @id) for resource URIs
  return (item.propertyAddress?.['_about'] as string | undefined) ?? '';
}

function buildDisplayAddress(addr: Address): string {
  const parts = [addr.saon, addr.paon, addr.street, addr.town, addr.postcode].filter(Boolean);
  return parts.join(', ');
}

export function normaliseAddress(raw: LdaItem['propertyAddress'], fallbackId?: string): Address {
  const id = (raw?.['_about'] as string | undefined) ?? fallbackId ?? '';
  const postcode = (raw?.postcode as string | undefined) ?? '';
  const street = (raw?.street as string | undefined) ?? '';
  const paon = (raw?.paon as string | undefined) ?? '';
  const saon = (raw?.saon as string | undefined) ?? '';
  const town = (raw?.town as string | undefined) ?? '';
  const addr: Address = { id, postcode, street, paon, saon, town, displayAddress: '' };
  addr.displayAddress = buildDisplayAddress(addr);
  return addr;
}

/** Parse any date string the LR API may return into YYYY-MM-DD. */
function parseTransactionDate(raw: string): string {
  if (!raw) return '';
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 10);
  // RFC 2822 / HTTP date format: "Tue, 04 May 2010"
  const d = new Date(raw);
  return isNaN(d.getTime()) ? '' : d.toISOString().substring(0, 10);
}

function normaliseTransaction(item: LdaItem): Transaction | null {
  // API uses _about (not @id) for resource URIs
  const uri = (item['_about'] as string | undefined) ?? '';
  // transactionId is returned as a top-level field; fall back to parsing the URI
  const id = (item.transactionId as string | undefined) ?? uri.split('/').slice(-2)[0] ?? '';
  const price = typeof item.pricePaid === 'number' ? item.pricePaid : Number(item.pricePaid);
  const rawDate = (item.transactionDate as string | undefined) ?? '';
  const date = parseTransactionDate(rawDate);
  if (!date || !price || isNaN(price)) return null;

  return {
    id,
    uri,
    price,
    date,
    propertyType: coercePropertyType(item.propertyType),
    estateType: coerceEstateType(item.estateType),
    newBuild: coerceNewBuild(item.newBuild),
    addressId: extractAddressId(item),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface FetchResult {
  transactions: Transaction[];
  addressMap: Map<string, Address>;
  isPartial: boolean;
  capsTriggered: boolean;
  warnings: string[];
}

interface FetchOptions {
  dateFrom?: string;
  dateTo?: string;
  propertyType?: PropertyTypeCode;
  newBuildOnly?: boolean;
  estateType?: EstateTypeCode;
}

/**
 * Fetch all transactions for a full postcode (exact match).
 */
export async function fetchByFullPostcode(postcode: string, opts: FetchOptions): Promise<FetchResult> {
  const normPostcode = normalisePostcode(postcode);
  const params: Record<string, string | number> = {
    'propertyAddress.postcode': normPostcode,
    _pageSize: PAGE_SIZE,
    _sort: 'transactionDate',
  };
  if (opts.propertyType) params['propertyType'] = opts.propertyType;
  if (opts.estateType) params['estateType'] = opts.estateType;
  if (opts.newBuildOnly) params['newBuild'] = 'true';

  return paginateTransactions('/data/ppi/transaction-record.json', params, opts);
}

/**
 * Fetch transactions for a partial postcode using the SPARQL endpoint.
 * Uses STRSTARTS prefix matching. Input sanitised to [A-Z0-9 ] only.
 */
export async function fetchByPartialPostcode(partial: string, opts: FetchOptions): Promise<FetchResult> {
  const safe = sanitisePostcodePrefix(partial);
  if (!safe) return emptyResult(['Invalid partial postcode']);
  // Request cap+1 so we can detect whether results were truncated
  const query = buildPartialPostcodeSparql(safe, SPARQL_CAP + 1, opts);
  return fetchBySparqlQuery(query, opts);
}

/**
 * Fetch transactions by street name + optional postcode qualifier using the SPARQL endpoint.
 * Input sanitised before embedding in SPARQL.
 */
export async function fetchByStreet(street: string, postcodeQualifier: string, opts: FetchOptions): Promise<FetchResult> {
  const safeStreet = sanitiseStreet(street);
  if (!safeStreet) return emptyResult(['Invalid street name']);
  // Request cap+1 so we can detect truncation
  const query = buildStreetSparql(safeStreet, postcodeQualifier, SPARQL_CAP + 1, opts);
  return fetchBySparqlQuery(query, opts);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function isFullPostcode(s: string): boolean {
  return /^[A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2}$/i.test(s.trim());
}

/** Allow only letters, digits, and spaces for postcode. */
function sanitisePostcodePrefix(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
}

/** Allow letters, digits, spaces, hyphens, apostrophes for street. */
function sanitiseStreet(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 '\-]/g, '').replace(/\s+/g, ' ').trim();
}

function escapeForSparql(s: string): string {
  // Escape backslash and double-quote; only safe chars remain after sanitise
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ── SPARQL query builders ────────────────────────────────────────────────────

/**
 * Build optional FILTER clauses for propertyType, estateType, newBuild.
 * Values are mapped to their LR URI equivalents (never raw user input).
 */
function buildSparqlOptionalFilters(opts: FetchOptions): string {
  const clauses: string[] = [];

  const propTypeUris: Partial<Record<PropertyTypeCode, string>> = {
    D: 'http://landregistry.data.gov.uk/def/common/detached',
    S: 'http://landregistry.data.gov.uk/def/common/semi-detached',
    T: 'http://landregistry.data.gov.uk/def/common/terraced',
    F: 'http://landregistry.data.gov.uk/def/common/flat-maisonette',
    O: 'http://landregistry.data.gov.uk/def/common/other-property-type',
  };
  const estTypeUris: Partial<Record<EstateTypeCode, string>> = {
    F: 'http://landregistry.data.gov.uk/def/common/freehold',
    L: 'http://landregistry.data.gov.uk/def/common/leasehold',
  };

  if (opts.propertyType && propTypeUris[opts.propertyType]) {
    clauses.push(`?propertyType = <${propTypeUris[opts.propertyType]}>`);
  }
  if (opts.estateType && estTypeUris[opts.estateType]) {
    clauses.push(`?estateType = <${estTypeUris[opts.estateType]}>`);
  }
  if (opts.newBuildOnly) {
    clauses.push('?newBuild = true');
  }

  return clauses.length ? `  FILTER(${clauses.join(' && ')})` : '';
}

function buildPartialPostcodeSparql(prefix: string, limit: number, opts: FetchOptions): string {
  const safe = escapeForSparql(prefix);
  const extraFilter = buildSparqlOptionalFilters(opts);
  return `${SPARQL_PREFIXES}
${SPARQL_SELECT}
WHERE ${SPARQL_WHERE_CORE}
  FILTER(STRSTARTS(STR(?postcode), "${safe}"))
${extraFilter}
}
ORDER BY ?date
LIMIT ${limit}`;
}

function buildStreetSparql(street: string, postcodeQualifier: string, limit: number, opts: FetchOptions): string {
  const safeStreet = escapeForSparql(street);
  const safePC = sanitisePostcodePrefix(postcodeQualifier);
  const extraFilter = buildSparqlOptionalFilters(opts);

  let postcodeClause = '';
  if (safePC) {
    if (isFullPostcode(safePC)) {
      const normPC = escapeForSparql(normalisePostcode(safePC));
      postcodeClause = `  FILTER(STR(?street) = "${safeStreet}" && STR(?postcode) = "${normPC}")`;
    } else {
      const safePCesc = escapeForSparql(safePC);
      postcodeClause = `  FILTER(STR(?street) = "${safeStreet}" && STRSTARTS(STR(?postcode), "${safePCesc}"))`;
    }
  } else {
    postcodeClause = `  FILTER(STR(?street) = "${safeStreet}")`;
  }

  return `${SPARQL_PREFIXES}
${SPARQL_SELECT}
WHERE ${SPARQL_WHERE_CORE}
${postcodeClause}
${extraFilter}
}
ORDER BY ?date
LIMIT ${limit}`;
}

// ── SPARQL result parser ──────────────────────────────────────────────────────

function parseSparqlRows(
  rows: SparqlRow[],
  opts: FetchOptions
): { transactions: Transaction[]; addressMap: Map<string, Address> } {
  const transactions: Transaction[] = [];
  const addressMap = new Map<string, Address>();

  for (const row of rows) {
    const uri = row.transaction?.value ?? '';
    const id = uri.split('/').slice(-2)[0] ?? '';
    const price = Number(row.price?.value ?? 0);
    // SPARQL returns ISO date directly (e.g. "2010-07-28" with xs:date datatype)
    const date = (row.date?.value ?? '').substring(0, 10);

    if (!date || !price || isNaN(price)) continue;
    if (opts.dateFrom && date < opts.dateFrom) continue;
    if (opts.dateTo && date > opts.dateTo) continue;

    const propertyTypeUri = row.propertyType?.value ?? '';
    const estateTypeUri = row.estateType?.value ?? '';
    const addressId = row.address?.value ?? '';

    transactions.push({
      id,
      uri,
      price,
      date,
      propertyType: coercePropertyType(propertyTypeUri),
      estateType: coerceEstateType(estateTypeUri),
      newBuild: row.newBuild?.value === 'true',
      addressId,
    });

    if (addressId && !addressMap.has(addressId)) {
      const addr: Address = {
        id: addressId,
        postcode: row.postcode?.value ?? '',
        street: row.street?.value ?? '',
        paon: row.paon?.value ?? '',
        saon: row.saon?.value ?? '',
        town: row.town?.value ?? '',
        displayAddress: '',
      };
      addr.displayAddress = buildDisplayAddress(addr);
      addressMap.set(addressId, addr);
    }
  }

  return { transactions, addressMap };
}

// ── SPARQL fetch ──────────────────────────────────────────────────────────────

async function fetchBySparqlQuery(
  sparqlQuery: string,
  opts: FetchOptions
): Promise<FetchResult> {
  const warnings: string[] = [];

  let rows: SparqlRow[];
  try {
    const { data } = await axios.get<SparqlResponse>(`${BASE_URL}${SPARQL_ENDPOINT}`, {
      params: { query: sparqlQuery, output: 'json' },
      timeout: SPARQL_TIMEOUT_MS,
      headers: { Accept: 'application/sparql-results+json, application/json' },
    });
    rows = data?.results?.bindings ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    warnings.push(`SPARQL query failed (${msg}). Try a more specific postcode or street.`);
    return { transactions: [], addressMap: new Map(), isPartial: true, capsTriggered: false, warnings };
  }

  // We requested SPARQL_CAP + 1; if we got more than cap, results are truncated
  const capsTriggered = rows.length > SPARQL_CAP;
  const isPartial = capsTriggered;
  if (capsTriggered) {
    rows = rows.slice(0, SPARQL_CAP);
    warnings.push(
      `Showing the first ${SPARQL_CAP} transactions. The actual dataset is larger — try a specific ` +
      `postcode sector (e.g. SW11 1) or full postcode (e.g. SW11 1AD) for complete results.`
    );
  }

  const { transactions, addressMap } = parseSparqlRows(rows, opts);
  return { transactions, addressMap, isPartial, capsTriggered, warnings };
}

async function paginateTransactions(
  path: string,
  baseParams: Record<string, string | number>,
  opts: FetchOptions
): Promise<FetchResult> {
  const transactions: Transaction[] = [];
  const addressMap = new Map<string, Address>();
  const warnings: string[] = [];
  let isPartial = false;
  let capsTriggered = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { ...baseParams, _page: page };
    let data: LdaResponse;
    try {
      data = await fetchWithRetry<LdaResponse>('/data/ppi/transaction-record.json', params);
    } catch {
      warnings.push(`Page ${page} fetch failed; results may be incomplete.`);
      isPartial = true;
      break;
    }

    const items = data?.result?.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      const tx = normaliseTransaction(item);
      if (!tx) continue;

      // Date filter (if provided)
      if (opts.dateFrom && tx.date < opts.dateFrom) continue;
      if (opts.dateTo && tx.date > opts.dateTo) continue;

      transactions.push(tx);

      // Populate addressMap using the address _about URI directly from the raw item
      // (tx.addressId is already derived from it, but we guard here too)
      const addrAbout = (item.propertyAddress?.['_about'] as string | undefined) ?? '';
      if (item.propertyAddress && addrAbout && !addressMap.has(addrAbout)) {
        addressMap.set(addrAbout, normaliseAddress(item.propertyAddress, addrAbout));
      }
    }

    // If we got fewer items than page size, we're done
    if (items.length < PAGE_SIZE) break;

    // Hard cap
    if (transactions.length >= MAX_PAGES * PAGE_SIZE) {
      capsTriggered = true;
      isPartial = true;
      warnings.push(`Result capped at ${transactions.length} transactions. Refine your search for complete results.`);
      break;
    }
  }

  return { transactions, addressMap, isPartial, capsTriggered, warnings };
}

function emptyResult(warnings: string[]): FetchResult {
  return {
    transactions: [],
    addressMap: new Map(),
    isPartial: false,
    capsTriggered: false,
    warnings,
  };
}
