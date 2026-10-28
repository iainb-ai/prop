import { Router, Request, Response } from 'express';
import { getDb, getLoadingState } from '../services/database';
import {
  computePropertyMetrics, computeGroups, computeOverallSummary,
  computeMarketTrendsFromAgg, AggYearTypeRow,
} from '../services/metrics';
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

// ─── Trend aggregation SQL ─────────────────────────────────────────────────────
// Uses AVG as proxy for median — avoids O(n log n) window functions.
// With covering indexes (postcode_nospc, deed_year, property_type, price_paid)
// these queries never touch main table rows.
//
// IMPORTANT: SQLite's query planner mis-estimates LIKE selectivity on large
// tables and picks idx_property_key (stat: 2 rows/key) over the postcode
// covering indexes. INDEXED BY forces the correct choice; tested 56x speedup.

function trendGroupBySql(
  fullWhere: string, typeExpr: string, groupExtra: string, indexName: string,
): string {
  const indexed = indexName ? `INDEXED BY ${indexName}` : '';
  return `
    SELECT
      deed_year,
      ${typeExpr}                   AS property_type,
      COUNT(*)                      AS count,
      CAST(AVG(price_paid) AS REAL) AS mean_price,
      CAST(AVG(price_paid) AS REAL) AS median_price,
      0.0                           AS q1_price,
      0.0                           AS q3_price
    FROM transactions ${indexed}
    WHERE ${fullWhere}
    GROUP BY deed_year${groupExtra}
    ORDER BY deed_year
  `;
}

// ─── POST /api/search ─────────────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const reqId = (req as Request & { id?: string }).id ?? '-';
  const t0 = Date.now();
  const timings: Record<string, number> = {};

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
  const { whereSql, params, queryType, trendIndex, keyIndex } = buildWhere(body.query.trim().toUpperCase(), warnings);

  let extraWhere = '';
  const extraParams: unknown[] = [];

  if (body.dateFrom)     { extraWhere += ' AND deed_date >= ?'; extraParams.push(body.dateFrom); }
  if (body.dateTo)       { extraWhere += ' AND deed_date <= ?'; extraParams.push(body.dateTo); }
  if (body.propertyType) { extraWhere += ' AND property_type = ?'; extraParams.push(body.propertyType); }
  if (body.estateType)   { extraWhere += ' AND estate_type = ?'; extraParams.push(body.estateType); }
  if (body.newBuildOnly) { extraWhere += ' AND new_build = 1'; }

  const fullWhere = whereSql + extraWhere;
  const allParams = [...params, ...extraParams];

  try {
    // ── 2. Trend aggregation — single GROUP BY (one SQL query instead of two) ──
    // allAggRows (the 'ALL' bucket) is derived from typeAggRows in JS; this saves
    // one full covering-index scan (~2 s on a 30M-row dataset).
    const tTrend = Date.now();
    const typeAggRows = db
      .prepare(trendGroupBySql(fullWhere, 'property_type', ', property_type', trendIndex))
      .all(...allParams) as AggYearTypeRow[];

    // Derive 'ALL' year aggregation from per-type rows (weighted mean)
    const allByYear = new Map<number, { count: number; wPrice: number }>();
    for (const r of typeAggRows) {
      const y = allByYear.get(r.deed_year);
      if (!y) allByYear.set(r.deed_year, { count: r.count, wPrice: r.mean_price * r.count });
      else { y.count += r.count; y.wPrice += r.mean_price * r.count; }
    }
    const allAggRows: AggYearTypeRow[] = [];
    for (const [yr, { count, wPrice }] of allByYear) {
      const mean = wPrice / count;
      allAggRows.push({ deed_year: yr, property_type: 'ALL', count, mean_price: mean, median_price: mean, q1_price: 0, q3_price: 0 });
    }
    allAggRows.sort((a, b) => a.deed_year - b.deed_year);
    timings.trends = Date.now() - tTrend;

    if (allAggRows.length === 0) {
      console.log(`[search:${reqId}] ${queryType} — no results (${Date.now() - t0}ms)`);
      res.json(emptyResponse(queryType, warnings));
      return;
    }

    const aggRows = [...typeAggRows, ...allAggRows];
    const marketTrends = computeMarketTrendsFromAgg(aggRows);

    // ── 3. Top properties + all their transactions — single CTE query ─────────
    // The CTE (top_keys) uses idx_postcode_nospc_pkey / idx_postcode_pkey for
    // an index-only GROUP BY (no main-table row reads for property_key).
    // The join back to transactions uses idx_property_key for up to CAP lookups.
    const tDetails = Date.now();
    const keyIndexed = keyIndex ? `INDEXED BY ${keyIndex}` : '';
    const combinedSql = `
      WITH top_keys AS (
        SELECT property_key, COUNT(*) AS tx_count
        FROM   transactions ${keyIndexed}
        WHERE  ${fullWhere}
        GROUP  BY property_key
        ORDER  BY tx_count DESC
        LIMIT  ${PROPERTY_LIST_CAP}
      )
      SELECT t.unique_id, t.price_paid, t.deed_date, t.postcode,
             t.property_type, t.new_build, t.estate_type,
             t.paon, t.saon, t.street, t.locality, t.town,
             t.district_name, t.county, t.transaction_category,
             t.property_key, t.display_address
      FROM   transactions t
      INNER  JOIN top_keys k USING (property_key)
      ORDER  BY k.tx_count DESC, t.property_key, t.deed_date
    `;
    const detailRows = db.prepare(combinedSql).all(...allParams) as DbRow[];
    timings.details = Date.now() - tDetails;

    // ── 4. Build property records (linear grouping — rows are pre-sorted) ─────
    const tBuild = Date.now();
    const { records: propertiesFull, uniqueKeyCount } = buildPropertyRecords(detailRows);
    // Trim each property's transactions to just the last one to reduce payload.
    // Full transaction history is available via GET /api/property?key=...
    const properties = propertiesFull.map(p => ({
      ...p,
      transactions: p.transactions.slice(-1),
    }));
    timings.build = Date.now() - tBuild;

    // ── 5. Total property count ───────────────────────────────────────────────
    // If fewer properties than the cap came back, uniqueKeyCount IS the total.
    // Only run COUNT DISTINCT when capped; new idx_postcode_nospc_pkey makes it
    // index-only (no main-table row reads).
    let totalProperties: number;
    if (uniqueKeyCount < PROPERTY_LIST_CAP) {
      totalProperties = uniqueKeyCount;
      timings.countDistinct = 0; // skipped
    } else {
      const tCount = Date.now();
      const countRow = db
        .prepare(`SELECT COUNT(DISTINCT property_key) AS n FROM transactions ${keyIndexed} WHERE ${fullWhere}`)
        .get(...allParams) as { n: number };
      totalProperties = countRow.n;
      timings.countDistinct = Date.now() - tCount;
    }

    // ── 6. Summary stats ──────────────────────────────────────────────────────
    const totalTransactions = allAggRows.reduce((s, r) => s + r.count, 0);
    const yearMin = Math.min(...allAggRows.map(r => r.deed_year));
    const yearMax = Math.max(...allAggRows.map(r => r.deed_year));

    const overallSummary = computeOverallSummary(properties);
    const groupDims: GroupByDimension[] = body.groupBy ?? [];
    const groups = groupDims.length > 0 ? computeGroups(properties, groupDims) : [];

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
        dateRange: { min: `${yearMin}-01-01`, max: `${yearMax}-12-31` },
        isTruncated: uniqueKeyCount >= PROPERTY_LIST_CAP,
      },
      warnings,
    };

    timings.total = Date.now() - t0;
    console.log(
      `[search:${reqId}] "${queryType}"` +
      ` | trends:${timings.trends}ms details:${timings.details}ms` +
      ` build:${timings.build}ms count:${timings.countDistinct}ms` +
      ` total:${timings.total}ms` +
      ` | props:${uniqueKeyCount} tx:${detailRows.length}`,
    );

    res.json(response);

  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`[search:${reqId}] ERROR after ${elapsed}ms — ${String(err)}`);
    if (err instanceof Error) console.error(err.stack);
    res.status(500).json({ error: 'Search failed. Check server logs for details.' });
  }
});

// ─── Build property records from pre-sorted DB rows ───────────────────────────
// Rows arrive ordered by (tx_count DESC, property_key, deed_date) from the CTE.
// Linear grouping — no Map allocation, no redundant array sort.

function buildPropertyRecords(
  rows: DbRow[],
): { records: PropertyRecord[]; uniqueKeyCount: number } {
  if (rows.length === 0) return { records: [], uniqueKeyCount: 0 };

  const records: PropertyRecord[] = [];
  let groupRows: DbRow[] = [];
  let currentKey = '';

  function flush() {
    if (groupRows.length === 0) return;
    const sample = groupRows[0];
    const address: Address = {
      displayAddress: sample.display_address,
      postcode:       sample.postcode,
      street:         sample.street         ?? '',
      paon:           sample.paon            ?? '',
      saon:           sample.saon            ?? '',
      town:           sample.town            ?? '',
      county:         sample.county          ?? '',
      district:       sample.district_name   ?? '',
    };
    // Transactions are in deed_date ASC order from the CTE — no sort needed
    const transactions: Transaction[] = groupRows.map(r => ({
      id:                  r.unique_id,
      price:               r.price_paid,
      date:                r.deed_date,
      propertyType:        r.property_type as Transaction['propertyType'],
      estateType:          r.estate_type   as Transaction['estateType'],
      newBuild:            r.new_build === 1,
      transactionCategory: r.transaction_category ?? '',
      linkedDataUri:       r.unique_id
        ? `https://landregistry.data.gov.uk/data/ppi/transaction/${r.unique_id}/current`
        : '',
    }));
    const metrics = computePropertyMetrics(transactions, true);
    records.push({ propertyKey: currentKey, address, transactions, metrics });
  }

  for (const r of rows) {
    if (r.property_key !== currentKey) {
      flush();
      currentKey = r.property_key;
      groupRows = [r];
    } else {
      groupRows.push(r);
    }
  }
  flush();

  // Records already in tx_count DESC order from the CTE — no sort needed
  return { records, uniqueKeyCount: records.length };
}

// ─── WHERE clause builder ─────────────────────────────────────────────────────

// trendIndex: best index for GROUP BY deed_year aggregations (has price_paid in index)
// keyIndex:   best index for GROUP BY property_key and COUNT DISTINCT
interface WhereResult {
  whereSql:   string;
  params:     unknown[];
  queryType:  string;
  trendIndex: string;  // e.g. 'idx_postcode_nospc_cover' — empty = let planner decide
  keyIndex:   string;  // e.g. 'idx_postcode_nospc_pkey'  — empty = let planner decide
}

function normalisePostcode(raw: string): string {
  const u = raw.toUpperCase().replace(/\s+/g, '');
  if (u.length < 4) return u;
  return u.slice(0, u.length - 3) + ' ' + u.slice(u.length - 3);
}

function buildWhere(rawQuery: string, warnings: string[]): WhereResult {
  // "STREET NAME, POSTCODE" pattern — postcode provides the covering index selectivity
  const commaIdx = rawQuery.lastIndexOf(',');
  if (commaIdx !== -1) {
    const streetPart   = rawQuery.slice(0, commaIdx).trim();
    const postcodePart = rawQuery.slice(commaIdx + 1).trim().replace(/\s+/g, '').toUpperCase();
    return {
      whereSql:   'street LIKE ? AND postcode_nospc LIKE ?',
      params:     [`%${streetPart}%`, `${postcodePart}%`],
      queryType:  `street "${streetPart}" in postcode starting "${postcodePart}"`,
      trendIndex: 'idx_postcode_nospc_cover',
      keyIndex:   'idx_postcode_nospc_pkey',
    };
  }

  const noSpaces = rawQuery.replace(/\s+/g, '').toUpperCase();
  const isPostcode = /^[A-Z]{1,2}\d/.test(noSpaces);

  if (isPostcode) {
    const isFull = /\d[A-Z]{2}$/.test(noSpaces);
    if (isFull) {
      const full = normalisePostcode(rawQuery);
      return {
        whereSql:   'postcode = ?',
        params:     [full],
        queryType:  `full postcode ${full}`,
        trendIndex: 'idx_postcode_cover',
        keyIndex:   'idx_postcode_pkey',
      };
    }
    const label = /\d$/.test(noSpaces) && noSpaces.length > 4
      ? `postcode sector ${rawQuery}`
      : `postcode district ${rawQuery}`;
    return {
      whereSql:   'postcode_nospc LIKE ?',
      params:     [`${noSpaces}%`],
      queryType:  label,
      trendIndex: 'idx_postcode_nospc_cover',
      keyIndex:   'idx_postcode_nospc_pkey',
    };
  }

  warnings.push(
    'Street-name search scans the entire dataset — very slow for large CSVs. ' +
    'For faster results include a postcode: "HIGH STREET, SW11".',
  );
  return {
    whereSql:   'street LIKE ?',
    params:     [`%${rawQuery}%`],
    queryType:  `street name "${rawQuery}"`,
    trendIndex: '',  // no useful index for unqualified street scan
    keyIndex:   '',
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
  const emptyTrend = {
    propertyType: 'ALL', label: 'All types', color: '#374151',
    dataPoints: [], cagr: null, totalTransactions: 0,
  };
  return {
    properties: [],
    groups: [],
    overallSummary: { all: emptyBucket, byPropertyType: [] },
    marketTrends: {
      byPropertyType: [], combined: emptyTrend,
      yearRange: { min: 0, max: 0 }, totalTransactions: 0, isTruncated: false,
    },
    summary: {
      totalTransactions: 0, totalProperties: 0, propertiesWithMetrics: 0,
      queryType, dateRange: null, isTruncated: false,
    },
    warnings: [...warnings, 'No transactions found matching your search.'],
  };
}

export default router;
