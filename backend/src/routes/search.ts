import { Router, Request, Response } from 'express';
import type { SearchRequest, SearchResponse, PropertyRecord, Transaction, Address } from '../types';
import { fetchByFullPostcode, fetchByPartialPostcode, fetchByStreet } from '../services/landRegistry';
import { computePropertyMetrics, computeGroups } from '../services/metrics';
import { getCached, setCached, buildCacheKey } from '../services/cache';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalisePostcode(s: string): string {
  const upper = s.trim().toUpperCase().replace(/\s+/g, ' ');
  const m = upper.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]}` : upper;
}

function detectQueryType(query: string): 'fullPostcode' | 'partialPostcode' | 'street' {
  const upper = query.trim().toUpperCase();
  if (/^[A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2}$/.test(upper)) return 'fullPostcode';
  if (/^[A-Z]{1,2}\d{1,2}[A-Z]?(\s+\d)?$/.test(upper)) return 'partialPostcode';
  return 'street';
}

function parseStreetQuery(query: string): { street: string; postcode: string } {
  // Format: "STREET NAME, SW11" or "STREET NAME, SW11 1AD"
  const parts = query.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    const street = parts.slice(0, parts.length - 1).join(', ');
    const postcode = parts[parts.length - 1];
    return { street, postcode };
  }
  return { street: parts[0], postcode: '' };
}

function assembleProperties(
  transactions: Transaction[],
  addressMap: Map<string, Address>,
  dateFrom?: string,
  dateTo?: string
): PropertyRecord[] {
  // Group by addressId
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = tx.addressId || fallbackKey(tx, addressMap);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  const properties: PropertyRecord[] = [];
  for (const [addressId, txs] of groups) {
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const address = addressMap.get(addressId) ?? fallbackAddress(sorted[0]);
    const metrics = computePropertyMetrics(sorted, dateFrom, dateTo);
    properties.push({ addressId, address, transactions: sorted, metrics });
  }

  return properties.sort((a, b) => a.address.displayAddress.localeCompare(b.address.displayAddress));
}

function fallbackKey(tx: Transaction, _addressMap: Map<string, Address>): string {
  // Give each orphaned transaction its own bucket so they don't collapse together
  return tx.id ? `orphan-${tx.id}` : `orphan-${Math.random()}`;
}

function fallbackAddress(tx: Transaction): Address {
  return {
    id: tx.addressId,
    postcode: '',
    street: '',
    paon: '',
    saon: '',
    town: '',
    displayAddress: `Unknown (${tx.addressId})`,
  };
}

// ── Route ────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const body = req.body as SearchRequest;

  if (!body.query || typeof body.query !== 'string' || body.query.trim().length < 2) {
    res.status(400).json({ error: 'query must be at least 2 characters' });
    return;
  }

  const groupBy = Array.isArray(body.groupBy) ? body.groupBy : [];

  const cacheKey = buildCacheKey({
    q: body.query.trim().toUpperCase(),
    dateFrom: body.dateFrom ?? '',
    dateTo: body.dateTo ?? '',
    propertyType: body.propertyType ?? '',
    newBuildOnly: body.newBuildOnly ?? false,
    estateType: body.estateType ?? '',
    groupBy,
  });

  const cached = getCached<SearchResponse>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const queryType = detectQueryType(body.query);
  const opts = {
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    propertyType: body.propertyType,
    newBuildOnly: body.newBuildOnly,
    estateType: body.estateType,
  };

  let fetchResult;
  try {
    if (queryType === 'fullPostcode') {
      fetchResult = await fetchByFullPostcode(normalisePostcode(body.query), opts);
    } else if (queryType === 'partialPostcode') {
      fetchResult = await fetchByPartialPostcode(body.query, opts);
    } else {
      const { street, postcode } = parseStreetQuery(body.query);
      fetchResult = await fetchByStreet(street, postcode, opts);
    }
  } catch (err) {
    console.error('Land Registry fetch error:', err);
    res.status(502).json({ error: 'Failed to fetch data from Land Registry API' });
    return;
  }

  const properties = assembleProperties(
    fetchResult.transactions,
    fetchResult.addressMap,
    body.dateFrom,
    body.dateTo
  );

  const groups = computeGroups(properties, groupBy);

  const allDates = fetchResult.transactions.map(t => t.date).sort();
  const summary = {
    totalProperties: properties.length,
    totalTransactions: fetchResult.transactions.length,
    propertiesWithMultipleSales: properties.filter(p => p.transactions.length >= 2).length,
    dateMin: allDates[0] ?? '',
    dateMax: allDates[allDates.length - 1] ?? '',
    queryType,
  };

  const response: SearchResponse = {
    properties,
    groups,
    summary,
    warnings: fetchResult.warnings,
    isPartialResult: fetchResult.isPartial,
    capsTriggered: fetchResult.capsTriggered,
  };

  setCached(cacheKey, response, fetchResult.transactions.length);
  res.json(response);
});

export default router;
