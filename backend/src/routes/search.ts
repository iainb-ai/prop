import { Router, Request, Response } from 'express';
import { getDb, getLoadingState } from '../services/database';
import { computePropertyMetrics, computeGroups, computeOverallSummary, computeMarketTrendsFromAgg, AggYearTypeRow } from '../services/metrics';
import {
  SearchRequest, SearchResponse, PropertyRecord, Transaction, Address, GroupByDimension,
} from '../types';

const router = Router();

// Max unique properties returned in the property list
const PROPERTY_LIST_CAP = 2_000;

// ─── DB row shape ─────────────────────────────────────────────────────────────

interface DbRow {
  unique_id: string;
  price_paid: number;
  deed_date: string;
  deed_year: number;
  postcode: string;
  property_type: string;
  new_build: number;
  estate_type: string;
  paon: string;
  saon: string;
  street: string;
  locality: string;
  town: string;
  district_name: string;
  county: string;
  transaction_category: string;
  property_key: string;
  display_address: string;
}

// Simple GROUP BY aggregation — O(n) scan with no sorting, returns ~200 rows max.
// Uses AVG as a proxy for median (acceptable for trend direction analysis).
// Avoids window functions which require O(n log n) sorting and can be very slow
// on large result sets without a covering index.
function trendGroupBySql(fullWhere: string, typeExpr: string, groupExtra: string): string {
  return `
    SELECT
      deed_year,
      ${typeExpr}                   AS property_type,
      COUNT(*)                      AS count,
      CAST(AVG(price_paid) AS REAL) AS mean_price,
      CAST(AVG(price_paid) AS REAL) AS median_price,
      0.0                           AS q1_price,
      0.0                           AS q3_price
    FROM transactions
    WHERE ${fullWhere}
    GROUP BY deed_year${groupExtra}
    ORDER BY deed_year
  `;
}

// POST /api/search
router.post('/', (req: Request, res: Response) => {
  const { status } = getLoadingState();
  if (status !== 'ready') {
    res.status(503).json({ error: 'Database not ready yet. Check /api/status.' });
    return;
  }

  const body = req.body as SearchRequest;
  if (!body.query || body.query.trim().length < 2) {
    res.status(400).json({ error: 'query must be at least 2 characters.' });
    return;
  }

  const db = getDb();
  const warnings: string[] = [];

  // ── 1. Build WHERE clause ────────────────────────────────────────────────────
  const { whereSql, params, queryType } = buildWhere(body.query.trim().toUpperCase(), warnings);

  let extraWhere = '';
  const extraParams: unknown[] = [];

  if (body.dateFrom)      { extraWhere += ' AND deed_date >= ?'; extraParams.push(body.dateFrom); }
  if (body.dateTo)        { extraWhere += ' AND deed_date <= ?'; extraParams.push(body.dateTo); }
  if (body.propertyType)  { extraWhere += ' AND property_type = ?'; extraParams.push(body.propertyType); }
  if (body.estateType)    { extraWhere += ' AND estate_type = ?'; extraParams.push(body.estateType); }
  if (body.newBuildOnly)  { extraWhere += ' AND new_build = 1'; }

  const fullWhere  = whereSql + extraWhere;
  const allParams  = [...params, ...extraParams];

  // ── 2. Aggregate trend data — GROUP BY (year, type), O(n) no sorting ─────────
  const typeAggRows = db
    .prepare(trendGroupBySql(fullWhere, 'property_type', ', property_type'))
    .all(...allParams) as AggYearTypeRow[];

  const allAggRows = db
    .prepare(trendGroupBySql(fullWhere, "'ALL'", ''))
    .all(...allParams) as AggYearTypeRow[];

  if (allAggRows.length === 0) {
    res.json(emptyResponse(queryType, warnings));
    return;
  }

  const aggRows = [...typeAggRows, ...allAggRows];

  // ── 3. Compute market trends from pre-aggregated rows ────────────────────────
  const marketTrends = computeMarketTrendsFromAgg(aggRows);

  // ── 4. Fetch top properties for the property list ─────────────────────────────
  // First, get the top PROPERTY_LIST_CAP property_keys by transaction count
  const topKeys = db
    .prepare(`SELECT property_key FROM transactions WHERE ${fullWhere} GROUP BY property_key ORDER BY COUNT(*) DESC LIMIT ${PROPERTY_LIST_CAP}`)
    .all(...allParams) as { property_key: string }[];

  let properties: PropertyRecord[] = [];

  if (topKeys.length > 0) {
    const placeholders = topKeys.map(() => '?').join(',');
    const keyValues = topKeys.map(r => r.property_key);
    const detailRows = db
      .prepare(`SELECT * FROM transactions WHERE property_key IN (${placeholders}) ORDER BY property_key, deed_date`)
      .all(...keyValues) as DbRow[];

    properties = buildPropertyRecords(detailRows);
  }

  // ── 5. Compute summary stats ─────────────────────────────────────────────────
  // totalTransactions = sum of per-year counts from the combined ('ALL') aggregation
  const totalTransactions = allAggRows.reduce((s, r) => s + r.count, 0);

  // For the actual date range, use the full date strings from fetched properties
  const detailDates = properties.flatMap(p => p.transactions.map(t => t.date));
  const minDate = detailDates.length > 0 ? detailDates.reduce((a, b) => a < b ? a : b) : null;
  const maxDate = detailDates.length > 0 ? detailDates.reduce((a, b) => a > b ? a : b) : null;

  // Use year range from trend data as fallback
  const yearMin = Math.min(...allAggRows.map(r => r.deed_year));
  const yearMax = Math.max(...allAggRows.map(r => r.deed_year));

  const overallSummary = computeOverallSummary(properties);

  const groupDims: GroupByDimension[] = body.groupBy ?? [];
  const groups = groupDims.length > 0 ? computeGroups(properties, groupDims) : [];

  // Count total unique properties matching the query (fast SQL COUNT DISTINCT)
  const totalPropertiesRow = db
    .prepare(`SELECT COUNT(DISTINCT property_key) as n FROM transactions WHERE ${fullWhere}`)
    .get(...allParams) as { n: number };
  const totalProperties = totalPropertiesRow.n;

  const response: SearchResponse = {
    properties,
    groups,
    overallSummary,
    marketTrends,
    summary: {
      totalTransactions,
      totalProperties,
      propertiesWithMetrics: properties.filter(p => p.metrics != null).length,
      queryType,
      dateRange: minDate && maxDate
        ? { min: minDate, max: maxDate }
        : { min: `${yearMin}-01-01`, max: `${yearMax}-12-31` },
      isTruncated: false,
    },
    warnings,
  };

  res.json(response);
});

// ─── Build property records from raw DB rows ──────────────────────────────────

function buildPropertyRecords(rows: DbRow[]): PropertyRecord[] {
  const map = new Map<string, DbRow[]>();
  for (const r of rows) {
    if (!map.has(r.property_key)) map.set(r.property_key, []);
    map.get(r.property_key)!.push(r);
  }

  const records: PropertyRecord[] = [];
  for (const [key, txRows] of map) {
    const sample = txRows[0];
    const address: Address = {
      displayAddress: sample.display_address,
      postcode: sample.postcode,
      street: sample.street ?? '',
      paon: sample.paon ?? '',
      saon: sample.saon ?? '',
      town: sample.town ?? '',
      county: sample.county ?? '',
      district: sample.district_name ?? '',
    };

    const transactions: Transaction[] = txRows.map(r => ({
      id:    r.unique_id,
      price: r.price_paid,
      date:  r.deed_date,
      propertyType:        r.property_type as Transaction['propertyType'],
      estateType:          r.estate_type as Transaction['estateType'],
      newBuild:            r.new_build === 1,
      transactionCategory: r.transaction_category ?? '',
      linkedDataUri:       r.unique_id
        ? `https://landregistry.data.gov.uk/data/ppi/transaction/${r.unique_id}/current`
        : '',
    }));

    transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const metrics = computePropertyMetrics(transactions);
    records.push({ propertyKey: key, address, transactions, metrics });
  }

  return records.sort((a, b) =>
    b.transactions.length - a.transactions.length ||
    a.address.displayAddress.localeCompare(b.address.displayAddress),
  );
}

// ─── WHERE clause builder ─────────────────────────────────────────────────────

interface WhereResult { whereSql: string; params: unknown[]; queryType: string; }

function normalisePostcode(raw: string): string {
  const u = raw.toUpperCase().replace(/\s+/g, '');
  if (u.length < 4) return u;
  return u.slice(0, u.length - 3) + ' ' + u.slice(u.length - 3);
}

function buildWhere(rawQuery: string, warnings: string[]): WhereResult {
  // "STREET NAME, POSTCODE" pattern
  const commaIdx = rawQuery.lastIndexOf(',');
  if (commaIdx !== -1) {
    const streetPart   = rawQuery.slice(0, commaIdx).trim();
    const postcodePart = rawQuery.slice(commaIdx + 1).trim().replace(/\s+/g, '').toUpperCase();
    return {
      whereSql:  'street LIKE ? AND postcode_nospc LIKE ?',
      params:    [`%${streetPart}%`, `${postcodePart}%`],
      queryType: `street "${streetPart}" in postcode starting "${postcodePart}"`,
    };
  }

  const noSpaces = rawQuery.replace(/\s+/g, '').toUpperCase();
  const isPostcode = /^[A-Z]{1,2}\d/.test(noSpaces);

  if (isPostcode) {
    const isFull = /\d[A-Z]{2}$/.test(noSpaces);
    if (isFull) {
      const full = normalisePostcode(rawQuery);
      return { whereSql: 'postcode = ?', params: [full], queryType: `full postcode ${full}` };
    }
    const label = /\d$/.test(noSpaces) && noSpaces.length > 4
      ? `postcode sector ${rawQuery}`
      : `postcode district ${rawQuery}`;
    return {
      whereSql:  'postcode_nospc LIKE ?',
      params:    [`${noSpaces}%`],
      queryType: label,
    };
  }

  warnings.push('Query treated as street name. For best results include a postcode: "STREET, SW11".');
  return {
    whereSql:  'street LIKE ?',
    params:    [`%${rawQuery}%`],
    queryType: `street name "${rawQuery}"`,
  };
}

// ─── Empty response helper ────────────────────────────────────────────────────

function emptyResponse(queryType: string, warnings: string[]): SearchResponse {
  const emptyBucket = {
    propertyType: 'ALL', label: 'All property types',
    totalProperties: 0, includedCount: 0,
    meanAvgGbpPerYear: 0, medianAvgGbpPerYear: 0,
    meanAvgPctPerYear: 0, medianAvgPctPerYear: 0,
    meanCagr: 0, medianCagr: 0,
  };
  const emptyTrend = { propertyType: 'ALL', label: 'All types', color: '#374151', dataPoints: [], cagr: null, totalTransactions: 0 };
  return {
    properties: [],
    groups: [],
    overallSummary: { all: emptyBucket, byPropertyType: [] },
    marketTrends: { byPropertyType: [], combined: emptyTrend, yearRange: { min: 0, max: 0 }, totalTransactions: 0, isTruncated: false },
    summary: { totalTransactions: 0, totalProperties: 0, propertiesWithMetrics: 0, queryType, dateRange: null, isTruncated: false },
    warnings: [...warnings, 'No transactions found matching your search.'],
  };
}

export default router;
