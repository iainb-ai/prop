/**
 * Metrics computation service.
 * All formulas follow PRD Section 9 exactly.
 */

import type {
  Transaction, PropertyRecord, PropertyMetrics, GroupMetrics, GroupByDimension, Address,
} from '../types';

// ── Property-level metrics ───────────────────────────────────────────────────

export function computePropertyMetrics(
  transactions: Transaction[],
  dateFrom?: string,
  dateTo?: string
): PropertyMetrics | undefined {
  const inRange = transactions
    .filter(t => (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  if (inRange.length < 2) return undefined;

  const first = inRange[0];
  const last = inRange[inRange.length - 1];

  const P0 = first.price;
  const P1 = last.price;
  const D0 = new Date(first.date);
  const D1 = new Date(last.date);
  const Y = (D1.getTime() - D0.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  if (Y <= 0 || P0 <= 0) return undefined;

  const absoluteChange = P1 - P0;
  const percentChange = absoluteChange / P0;
  const avgGbpPerYear = absoluteChange / Y;
  const avgPctPerYear = percentChange / Y;
  const cagr = Math.pow(P1 / P0, 1 / Y) - 1;

  return {
    firstPrice: P0,
    firstDate: first.date,
    lastPrice: P1,
    lastDate: last.date,
    yearsElapsed: Y,
    absoluteChange,
    percentChange,
    avgGbpPerYear,
    avgPctPerYear,
    cagr,
    transactionCount: inRange.length,
  };
}

// ── Property grouping ────────────────────────────────────────────────────────

function getPostcodeSector(postcode: string): string {
  // "SW11 1AD" -> "SW11 1"
  const m = postcode.trim().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?\s+\d)/i);
  return m ? m[1].toUpperCase() : postcode;
}

function getPostcodeDistrict(postcode: string): string {
  // "SW11 1AD" -> "SW11"
  const m = postcode.trim().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/i);
  return m ? m[1].toUpperCase() : postcode;
}

function getBuildingOrStreet(address: Address, propType: string): string {
  // For flats (F), use building name from saon/paon; otherwise use street
  if (propType === 'F' && address.saon) {
    // Extract building name from saon: "103, LUMIERE APARTMENTS" -> "LUMIERE APARTMENTS"
    const parts = address.saon.split(',').map(s => s.trim());
    return parts.length > 1 ? parts.slice(1).join(', ') : parts[0];
  }
  return address.street || address.displayAddress;
}

export function groupKey(
  property: PropertyRecord,
  dimensions: GroupByDimension[]
): string {
  const parts: string[] = [];
  const addr = property.address;
  const propType = property.transactions[0]?.propertyType ?? 'O';

  for (const dim of dimensions) {
    switch (dim) {
      case 'postcodeUnit':
        parts.push(`pc:${addr.postcode}`);
        break;
      case 'postcodeSector':
        parts.push(`sector:${getPostcodeSector(addr.postcode)}`);
        break;
      case 'postcodeDistrict':
        parts.push(`district:${getPostcodeDistrict(addr.postcode)}`);
        break;
      case 'propertyType':
        parts.push(`type:${propType}`);
        break;
      case 'buildingOrStreet':
        parts.push(`bldg:${getBuildingOrStreet(addr, propType)}`);
        break;
    }
  }
  return parts.join('|');
}

export function groupLabel(
  property: PropertyRecord,
  dimensions: GroupByDimension[]
): string {
  const parts: string[] = [];
  const addr = property.address;
  const propType = property.transactions[0]?.propertyType ?? 'O';

  for (const dim of dimensions) {
    switch (dim) {
      case 'postcodeUnit': parts.push(addr.postcode); break;
      case 'postcodeSector': parts.push(getPostcodeSector(addr.postcode)); break;
      case 'postcodeDistrict': parts.push(getPostcodeDistrict(addr.postcode)); break;
      case 'propertyType': parts.push(propertyTypeLabel(propType)); break;
      case 'buildingOrStreet': parts.push(getBuildingOrStreet(addr, propType)); break;
    }
  }
  return parts.join(' / ');
}

// ── Group-level aggregation ──────────────────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function computeGroups(
  properties: PropertyRecord[],
  dimensions: GroupByDimension[]
): GroupMetrics[] {
  if (dimensions.length === 0) return [];

  const buckets = new Map<string, { label: string; properties: PropertyRecord[] }>();

  for (const prop of properties) {
    const key = groupKey(prop, dimensions);
    const label = groupLabel(prop, dimensions);
    if (!buckets.has(key)) buckets.set(key, { label, properties: [] });
    buckets.get(key)!.properties.push(prop);
  }

  const result: GroupMetrics[] = [];

  for (const [key, { label, properties: props }] of buckets) {
    const included = props.filter(p => p.metrics !== undefined);
    const m = included.map(p => p.metrics!);

    const allDates = props.flatMap(p => p.transactions.map(t => t.date));
    const sortedDates = allDates.sort();

    result.push({
      key,
      label,
      propertyCount: props.length,
      includedCount: included.length,
      meanAbsoluteChange: mean(m.map(x => x.absoluteChange)),
      medianAbsoluteChange: median(m.map(x => x.absoluteChange)),
      meanPercentChange: mean(m.map(x => x.percentChange)),
      medianPercentChange: median(m.map(x => x.percentChange)),
      meanAvgGbpPerYear: mean(m.map(x => x.avgGbpPerYear)),
      medianAvgGbpPerYear: median(m.map(x => x.avgGbpPerYear)),
      meanCagr: mean(m.map(x => x.cagr)),
      medianCagr: median(m.map(x => x.cagr)),
      minPercentChange: m.length ? Math.min(...m.map(x => x.percentChange)) : 0,
      maxPercentChange: m.length ? Math.max(...m.map(x => x.percentChange)) : 0,
      minFirstSaleDate: sortedDates[0] ?? '',
      maxLastSaleDate: sortedDates[sortedDates.length - 1] ?? '',
    });
  }

  return result.sort((a, b) => b.includedCount - a.includedCount);
}

// ── Utilities ────────────────────────────────────────────────────────────────

export function propertyTypeLabel(code: string): string {
  const map: Record<string, string> = {
    D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat/Maisonette', O: 'Other',
  };
  return map[code] ?? code;
}
