import {
  Transaction, PropertyMetrics, PropertyRecord, GroupMetrics, GroupByDimension,
  PropertyTypeSummary, OverallSummary,
} from '../types';

// ─── Property-level metrics ────────────────────────────────────────────────────

export function computePropertyMetrics(
  transactions: Transaction[],
): PropertyMetrics | undefined {
  if (transactions.length < 2) return undefined;

  // Sort by date ascending, tie-break by id
  const sorted = [...transactions].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const P0 = first.price;
  const P1 = last.price;

  const d0 = new Date(first.date).getTime();
  const d1 = new Date(last.date).getTime();
  const days = (d1 - d0) / (1000 * 60 * 60 * 24);
  const Y = days / 365.25;

  if (Y <= 0 || P0 <= 0) return undefined;

  const absoluteChange = P1 - P0;
  const percentChange = absoluteChange / P0;
  const avgGbpPerYear = absoluteChange / Y;
  const avgPctPerYear = percentChange / Y;
  const cagr = Math.pow(P1 / P0, 1 / Y) - 1;

  return {
    firstSalePrice: P0,
    firstSaleDate: first.date,
    lastSalePrice: P1,
    lastSaleDate: last.date,
    absoluteChange,
    percentChange,
    yearsElapsed: Y,
    avgGbpPerYear,
    avgPctPerYear,
    cagr,
    transactionCount: transactions.length,
  };
}

// ─── Grouping ──────────────────────────────────────────────────────────────────

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat/Maisonette', O: 'Other',
};

function groupKey(record: PropertyRecord, dim: GroupByDimension): string {
  const { address } = record;
  const pc = address.postcode.replace(/\s+/g, '');
  switch (dim) {
    case 'postcodeUnit':    return address.postcode;
    case 'postcodeSector':  return pc.slice(0, pc.length - 2) + ' ' + pc.slice(pc.length - 2, pc.length - 1);
    case 'postcodeDistrict': return pc.replace(/\d[A-Z]{2}$/, '').trim();
    case 'propertyType':    return address.postcode.split(' ')[0] + '/' + (record.transactions[0]?.propertyType ?? 'O');
    case 'buildingOrStreet': return address.paon || address.street;
  }
}

function groupLabel(record: PropertyRecord, dim: GroupByDimension): string {
  const { address } = record;
  const pc = address.postcode.replace(/\s+/g, '');
  switch (dim) {
    case 'postcodeUnit':    return address.postcode;
    case 'postcodeSector':  return pc.slice(0, pc.length - 2) + ' ' + pc.slice(pc.length - 2, pc.length - 1);
    case 'postcodeDistrict': return pc.replace(/\d[A-Z]{2}$/, '').trim();
    case 'propertyType':    return PROPERTY_TYPE_LABELS[record.transactions[0]?.propertyType ?? 'O'] ?? 'Other';
    case 'buildingOrStreet': return address.paon || address.street;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function computeGroups(
  records: PropertyRecord[],
  dims: GroupByDimension[],
): GroupMetrics[] {
  if (dims.length === 0) return [];

  // Build composite key from all selected dimensions
  const keyFor = (r: PropertyRecord) => dims.map(d => groupKey(r, d)).join('||');
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
    const pcts = included.map(r => r.metrics!.percentChange);
    const abs = included.map(r => r.metrics!.absoluteChange);
    const gbpYr = included.map(r => r.metrics!.avgGbpPerYear);
    const cagrs = included.map(r => r.metrics!.cagr);

    const allDates = recs.flatMap(r => r.transactions.map(t => t.date));

    groups.push({
      groupKey: key,
      groupLabel: label,
      propertyCount: recs.length,
      includedCount: included.length,
      meanAbsoluteChange: mean(abs),
      medianAbsoluteChange: median(abs),
      meanPercentChange: mean(pcts),
      medianPercentChange: median(pcts),
      meanAvgGbpPerYear: mean(gbpYr),
      meanCagr: mean(cagrs),
      minPercentChange: included.length > 0 ? Math.min(...pcts) : 0,
      maxPercentChange: included.length > 0 ? Math.max(...pcts) : 0,
      minFirstSaleDate: allDates.length > 0 ? allDates.reduce((a, b) => a < b ? a : b) : '',
      maxLastSaleDate: allDates.length > 0 ? allDates.reduce((a, b) => a > b ? a : b) : '',
    });
  }

  return groups.sort((a, b) => b.includedCount - a.includedCount);
}

// ─── Overall summary ───────────────────────────────────────────────────────────

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

function summarise(
  propertyType: string,
  label: string,
  records: PropertyRecord[],
): PropertyTypeSummary {
  const included = records.filter(r => r.metrics != null);
  const gbpYr  = included.map(r => r.metrics!.avgGbpPerYear);
  const pctYr  = included.map(r => r.metrics!.avgPctPerYear);
  const cagrs  = included.map(r => r.metrics!.cagr);
  return {
    propertyType,
    label,
    totalProperties: records.length,
    includedCount: included.length,
    meanAvgGbpPerYear:   mean(gbpYr),
    medianAvgGbpPerYear: median(gbpYr),
    meanAvgPctPerYear:   mean(pctYr),
    medianAvgPctPerYear: median(pctYr),
    meanCagr:   mean(cagrs),
    medianCagr: median(cagrs),
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

  // Preserve a meaningful display order
  const ORDER = ['D', 'S', 'T', 'F', 'O'];
  const byPropertyType = ORDER
    .filter(pt => buckets.has(pt))
    .map(pt => summarise(pt, TYPE_LABELS[pt] ?? pt, buckets.get(pt)!));

  return { all, byPropertyType };
}
