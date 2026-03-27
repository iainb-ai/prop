import {
  Transaction, PropertyMetrics, PropertyRecord, GroupMetrics, GroupByDimension,
  PropertyTypeSummary, OverallSummary, MarketTrends, PropertyTypeTrend, YearlyDataPoint,
} from '../types';

// ─── Property-level metrics ────────────────────────────────────────────────────

export function computePropertyMetrics(
  transactions: Transaction[],
  alreadySorted = false,
): PropertyMetrics | undefined {
  if (transactions.length < 2) return undefined;

  const ordered = alreadySorted ? transactions : [...transactions].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const P0 = first.price;
  const P1 = last.price;

  const d0 = new Date(first.date).getTime();
  const d1 = new Date(last.date).getTime();
  const Y = (d1 - d0) / (1000 * 60 * 60 * 24 * 365.25);

  if (Y <= 0 || P0 <= 0) return undefined;

  const absoluteChange = P1 - P0;
  const percentChange  = absoluteChange / P0;

  return {
    firstSalePrice: P0,
    firstSaleDate: first.date,
    lastSalePrice: P1,
    lastSaleDate: last.date,
    absoluteChange,
    percentChange,
    yearsElapsed:    Y,
    avgGbpPerYear:   absoluteChange / Y,
    avgPctPerYear:   percentChange / Y,
    cagr:            Math.pow(P1 / P0, 1 / Y) - 1,
    transactionCount: transactions.length,
  };
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ─── Grouping ──────────────────────────────────────────────────────────────────

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat/Maisonette', O: 'Other',
};

function groupKey(record: PropertyRecord, dim: GroupByDimension): string {
  const { address } = record;
  const pc = address.postcode.replace(/\s+/g, '');
  switch (dim) {
    case 'postcodeUnit':     return address.postcode;
    case 'postcodeSector':   return pc.slice(0, pc.length - 3) + ' ' + pc[pc.length - 3];
    case 'postcodeDistrict': return pc.replace(/\d[A-Z]{2}$/, '').trim();
    case 'propertyType':     return address.postcode.split(' ')[0] + '/' + (record.transactions[0]?.propertyType ?? 'O');
    case 'buildingOrStreet': return address.paon || address.street;
  }
}

function groupLabel(record: PropertyRecord, dim: GroupByDimension): string {
  const { address } = record;
  const pc = address.postcode.replace(/\s+/g, '');
  switch (dim) {
    case 'postcodeUnit':     return address.postcode;
    case 'postcodeSector':   return pc.slice(0, pc.length - 3) + ' ' + pc[pc.length - 3];
    case 'postcodeDistrict': return pc.replace(/\d[A-Z]{2}$/, '').trim();
    case 'propertyType':     return PROPERTY_TYPE_LABELS[record.transactions[0]?.propertyType ?? 'O'] ?? 'Other';
    case 'buildingOrStreet': return address.paon || address.street;
  }
}

export function computeGroups(
  records: PropertyRecord[],
  dims: GroupByDimension[],
): GroupMetrics[] {
  if (dims.length === 0) return [];

  const keyFor   = (r: PropertyRecord) => dims.map(d => groupKey(r, d)).join('||');
  const labelFor = (r: PropertyRecord) => dims.map(d => groupLabel(r, d)).join(' / ');

  const buckets = new Map<string, { label: string; records: PropertyRecord[] }>();
  for (const r of records) {
    const k = keyFor(r);
    if (!buckets.has(k)) buckets.set(k, { label: labelFor(r), records: [] });
    buckets.get(k)!.records.push(r);
  }

  const groups: GroupMetrics[] = [];
  for (const [key, { label, records: recs }] of buckets) {
    const included = recs.filter(r => r.metrics != null);
    const pcts   = included.map(r => r.metrics!.percentChange);
    const abs    = included.map(r => r.metrics!.absoluteChange);
    const gbpYr  = included.map(r => r.metrics!.avgGbpPerYear);
    const cagrs  = included.map(r => r.metrics!.cagr);
    let minDate = '';
    let maxDate = '';
    for (const r of recs) {
      const f = r.metrics?.firstSaleDate ?? r.transactions[0]?.date ?? '';
      const l = r.metrics?.lastSaleDate  ?? r.transactions[r.transactions.length - 1]?.date ?? '';
      if (f && (minDate === '' || f < minDate)) minDate = f;
      if (l && (maxDate === '' || l > maxDate)) maxDate = l;
    }

    groups.push({
      groupKey: key, groupLabel: label,
      propertyCount: recs.length, includedCount: included.length,
      meanAbsoluteChange: mean(abs), medianAbsoluteChange: median(abs),
      meanPercentChange: mean(pcts), medianPercentChange: median(pcts),
      meanAvgGbpPerYear: mean(gbpYr), meanCagr: mean(cagrs),
      minPercentChange: included.length > 0 ? Math.min(...pcts) : 0,
      maxPercentChange: included.length > 0 ? Math.max(...pcts) : 0,
      minFirstSaleDate: minDate,
      maxLastSaleDate:  maxDate,
    });
  }

  return groups.sort((a, b) => b.includedCount - a.includedCount);
}

// ─── Overall summary ──────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat/Maisonette', O: 'Other',
};

function dominantPropertyType(record: PropertyRecord): string {
  const counts: Record<string, number> = {};
  for (const tx of record.transactions) {
    counts[tx.propertyType] = (counts[tx.propertyType] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'O';
}

function summarise(propertyType: string, label: string, records: PropertyRecord[]): PropertyTypeSummary {
  const included = records.filter(r => r.metrics != null);
  const gbpYr = included.map(r => r.metrics!.avgGbpPerYear);
  const pctYr = included.map(r => r.metrics!.avgPctPerYear);
  const cagrs = included.map(r => r.metrics!.cagr);
  return {
    propertyType, label,
    totalProperties: records.length, includedCount: included.length,
    meanAvgGbpPerYear: mean(gbpYr),   medianAvgGbpPerYear: median(gbpYr),
    meanAvgPctPerYear: mean(pctYr),   medianAvgPctPerYear: median(pctYr),
    meanCagr: mean(cagrs),            medianCagr: median(cagrs),
  };
}

export function computeOverallSummary(records: PropertyRecord[]): OverallSummary {
  const all = summarise('ALL', 'All property types', records);

  const buckets = new Map<string, PropertyRecord[]>();
  for (const r of records) {
    const pt = dominantPropertyType(r);
    if (!buckets.has(pt)) buckets.set(pt, []);
    buckets.get(pt)!.push(r);
  }

  const byPropertyType = ['D', 'S', 'T', 'F', 'O']
    .filter(pt => buckets.has(pt))
    .map(pt => summarise(pt, TYPE_LABELS[pt] ?? pt, buckets.get(pt)!));

  return { all, byPropertyType };
}

// ─── Market trends from SQL pre-aggregated rows ───────────────────────────────

export interface AggYearTypeRow {
  deed_year: number;
  property_type: string; // 'D'|'S'|'T'|'F'|'O'|'ALL'
  count: number;
  mean_price: number;
  median_price: number;
  q1_price: number;
  q3_price: number;
}

export function computeMarketTrendsFromAgg(aggRows: AggYearTypeRow[]): MarketTrends {
  if (aggRows.length === 0) {
    const empty: PropertyTypeTrend = {
      propertyType: 'ALL', label: 'All types', color: TREND_COLORS.ALL,
      dataPoints: [], cagr: null, totalTransactions: 0,
    };
    return { byPropertyType: [], combined: empty, yearRange: { min: 0, max: 0 }, totalTransactions: 0, isTruncated: false };
  }

  function buildTrendFromAgg(propertyType: string, rows: AggYearTypeRow[]): PropertyTypeTrend {
    const sorted = [...rows].sort((a, b) => a.deed_year - b.deed_year);
    let prevMedian: number | null = null;
    let baseMedian: number | null = null;

    const dataPoints: YearlyDataPoint[] = sorted.map(row => {
      const med = row.median_price ?? row.mean_price;
      if (baseMedian === null) baseMedian = med;
      const yoyPctChange = prevMedian !== null && prevMedian > 0 ? (med - prevMedian) / prevMedian : null;
      const priceIndex   = baseMedian > 0 ? (med / baseMedian) * 100 : null;
      prevMedian = med;
      return {
        year: row.deed_year,
        medianPrice: med,
        meanPrice: row.mean_price,
        q1Price: row.q1_price ?? 0,
        q3Price: row.q3_price ?? 0,
        count: row.count,
        yoyPctChange,
        priceIndex,
      };
    });

    const first = dataPoints[0];
    const last  = dataPoints[dataPoints.length - 1];
    const cagrYears = (last?.year ?? 0) - (first?.year ?? 0);
    const cagr = dataPoints.length >= 2 && cagrYears > 0 && first.medianPrice > 0
      ? Math.pow(last.medianPrice / first.medianPrice, 1 / cagrYears) - 1
      : null;

    return {
      propertyType,
      label: TREND_LABELS[propertyType] ?? propertyType,
      color: TREND_COLORS[propertyType] ?? '#6b7280',
      dataPoints,
      cagr,
      totalTransactions: rows.reduce((s, r) => s + r.count, 0),
    };
  }

  const typeBuckets = new Map<string, AggYearTypeRow[]>();
  for (const row of aggRows) {
    if (!typeBuckets.has(row.property_type)) typeBuckets.set(row.property_type, []);
    typeBuckets.get(row.property_type)!.push(row);
  }

  const combined      = buildTrendFromAgg('ALL', typeBuckets.get('ALL') ?? []);
  const byPropertyType = ['D', 'S', 'T', 'F', 'O']
    .filter(pt => typeBuckets.has(pt))
    .map(pt => buildTrendFromAgg(pt, typeBuckets.get(pt)!));

  const allYears = aggRows.map(r => r.deed_year);
  return {
    byPropertyType, combined,
    yearRange: { min: Math.min(...allYears), max: Math.max(...allYears) },
    totalTransactions: combined.totalTransactions,
    isTruncated: false,
  };
}

// ─── Market trends (year-by-year aggregation from raw rows — kept for reference) ───

const TREND_COLORS: Record<string, string> = {
  D: '#006e39', S: '#2563eb', T: '#d97706', F: '#7c3aed', O: '#9ca3af', ALL: '#374151',
};

const TREND_LABELS: Record<string, string> = {
  D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat/Maisonette', O: 'Other', ALL: 'All types',
};

export function computeMarketTrends(
  rows: Array<{ year: number; propertyType: string; price: number }>,
  isTruncated = false,
): MarketTrends {
  if (rows.length === 0) {
    const empty: PropertyTypeTrend = { propertyType: 'ALL', label: 'All types', color: TREND_COLORS.ALL, dataPoints: [], cagr: null, totalTransactions: 0 };
    return { byPropertyType: [], combined: empty, yearRange: { min: 0, max: 0 }, totalTransactions: 0, isTruncated };
  }

  const allYears = [...new Set(rows.map(r => r.year))].sort((a, b) => a - b);

  function buildTrend(propertyType: string, subset: Array<{ year: number; price: number }>): PropertyTypeTrend {
    const byYear = new Map<number, number[]>();
    for (const r of subset) {
      if (!byYear.has(r.year)) byYear.set(r.year, []);
      byYear.get(r.year)!.push(r.price);
    }

    const years = [...byYear.keys()].sort((a, b) => a - b);
    let baseMedian: number | null = null;
    let prevMedian: number | null = null;

    const dataPoints: YearlyDataPoint[] = years.map(year => {
      const prices = byYear.get(year)!.sort((a, b) => a - b);
      const med = median(prices);
      if (baseMedian === null) baseMedian = med;

      const yoyPctChange  = prevMedian !== null && prevMedian > 0 ? (med - prevMedian) / prevMedian : null;
      const priceIndex    = baseMedian > 0 ? (med / baseMedian) * 100 : null;
      prevMedian = med;

      return {
        year, medianPrice: med, meanPrice: mean(prices),
        q1Price: percentile(prices, 0.25), q3Price: percentile(prices, 0.75),
        count: prices.length, yoyPctChange, priceIndex,
      };
    });

    const first = dataPoints[0];
    const last  = dataPoints[dataPoints.length - 1];
    const cagrYears = (last?.year ?? 0) - (first?.year ?? 0);
    const cagr = (dataPoints.length >= 2 && cagrYears > 0 && first.medianPrice > 0)
      ? Math.pow(last.medianPrice / first.medianPrice, 1 / cagrYears) - 1
      : null;

    return {
      propertyType,
      label: TREND_LABELS[propertyType] ?? propertyType,
      color: TREND_COLORS[propertyType] ?? '#6b7280',
      dataPoints, cagr,
      totalTransactions: subset.length,
    };
  }

  // Build per-type buckets
  const typeBuckets = new Map<string, Array<{ year: number; price: number }>>();
  for (const r of rows) {
    if (!typeBuckets.has(r.propertyType)) typeBuckets.set(r.propertyType, []);
    typeBuckets.get(r.propertyType)!.push({ year: r.year, price: r.price });
  }

  const combined = buildTrend('ALL', rows.map(r => ({ year: r.year, price: r.price })));

  const byPropertyType = ['D', 'S', 'T', 'F', 'O']
    .filter(pt => typeBuckets.has(pt))
    .map(pt => buildTrend(pt, typeBuckets.get(pt)!));

  return {
    byPropertyType, combined,
    yearRange: { min: allYears[0], max: allYears[allYears.length - 1] },
    totalTransactions: rows.length, isTruncated,
  };
}
