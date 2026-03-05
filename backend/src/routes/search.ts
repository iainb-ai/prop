import { Router, Request, Response } from 'express';
import { getDataset } from '../services/dataStore';
import { computePropertyMetrics, computeGroups, computeOverallSummary } from '../services/metrics';
import { normalisePostcode } from '../services/csvParser';
import {
  SearchRequest, SearchResponse, PropertyRecord, Transaction,
  Address, CsvTransaction, GroupByDimension,
} from '../types';

const router = Router();


// POST /api/search
router.post('/', (req: Request, res: Response) => {
  const body = req.body as SearchRequest;

  if (!body.sessionId) {
    res.status(400).json({ error: 'sessionId is required.' });
    return;
  }
  if (!body.query || body.query.trim().length < 2) {
    res.status(400).json({ error: 'query must be at least 2 characters.' });
    return;
  }

  const dataset = getDataset(body.sessionId);
  if (!dataset) {
    res.status(404).json({ error: 'Session not found or expired. Please re-upload your CSV.' });
    return;
  }

  const warnings: string[] = [];
  let capsTriggered = false;

  // ── 1. Determine query type and filter transactions ──────────────────────────
  const rawQuery = body.query.trim().toUpperCase();
  const { queryType, matcher } = buildMatcher(rawQuery, warnings);

  let filtered = dataset.transactions.filter(matcher);

  // ── 2. Apply optional filters ────────────────────────────────────────────────
  if (body.dateFrom) {
    filtered = filtered.filter(t => t.deedDate >= body.dateFrom!);
  }
  if (body.dateTo) {
    filtered = filtered.filter(t => t.deedDate <= body.dateTo!);
  }
  if (body.propertyType) {
    filtered = filtered.filter(t => t.propertyType === body.propertyType);
  }
  if (body.estateType) {
    filtered = filtered.filter(t => t.estateType === body.estateType);
  }
  if (body.newBuildOnly) {
    filtered = filtered.filter(t => t.newBuild);
  }

  if (filtered.length === 0) {
    const emptyBucket = { propertyType: 'ALL', label: 'All property types', totalProperties: 0, includedCount: 0, meanAvgGbpPerYear: 0, medianAvgGbpPerYear: 0, meanAvgPctPerYear: 0, medianAvgPctPerYear: 0, meanCagr: 0, medianCagr: 0 };
    const response: SearchResponse = {
      properties: [],
      groups: [],
      overallSummary: { all: emptyBucket, byPropertyType: [] },
      summary: {
        totalTransactions: 0,
        totalProperties: 0,
        propertiesWithMetrics: 0,
        queryType,
        dateRange: null,
      },
      warnings: [...warnings, 'No transactions found matching your search.'],
      isPartialResult: false,
      capsTriggered: false,
    };
    res.json(response);
    return;
  }

  // ── 3. Group by property key ─────────────────────────────────────────────────
  const propertyMap = new Map<string, CsvTransaction[]>();
  for (const tx of filtered) {
    if (!propertyMap.has(tx.propertyKey)) propertyMap.set(tx.propertyKey, []);
    propertyMap.get(tx.propertyKey)!.push(tx);
  }

  const isPartialResult = false;
  const propertyEntries = [...propertyMap.entries()];

  // ── 4. Build PropertyRecord objects ──────────────────────────────────────────
  const properties: PropertyRecord[] = [];
  for (const [key, txs] of propertyEntries) {
    const sample = txs[0];
    const address: Address = {
      displayAddress: sample.displayAddress,
      postcode: sample.postcode,
      street: sample.street,
      paon: sample.paon,
      saon: sample.saon,
      town: sample.town,
      county: sample.county,
      district: sample.district,
    };

    const transactions: Transaction[] = txs.map(t => ({
      id: t.uniqueId,
      price: t.pricePaid,
      date: t.deedDate,
      propertyType: t.propertyType,
      estateType: t.estateType,
      newBuild: t.newBuild,
      transactionCategory: t.transactionCategory,
      linkedDataUri: t.linkedDataUri,
    }));

    // Sort transactions ascending for metrics
    transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    const metrics = computePropertyMetrics(transactions);

    properties.push({ propertyKey: key, address, transactions, metrics });
  }

  // ── 5. Sort properties: most transactions first, then alphabetical ────────────
  properties.sort((a, b) =>
    b.transactions.length - a.transactions.length ||
    a.address.displayAddress.localeCompare(b.address.displayAddress),
  );

  // ── 6. Compute groups ────────────────────────────────────────────────────────
  const groupDims: GroupByDimension[] = body.groupBy ?? [];
  const groups = groupDims.length > 0 ? computeGroups(properties, groupDims) : [];

  // ── 7. Compute overall summary ───────────────────────────────────────────────
  const overallSummary = computeOverallSummary(properties);

  // ── 8. Compute summary date range ────────────────────────────────────────────
  const allDates = filtered.map(t => t.deedDate);
  const minDate = allDates.reduce((a, b) => a < b ? a : b);
  const maxDate = allDates.reduce((a, b) => a > b ? a : b);

  const response: SearchResponse = {
    properties,
    groups,
    overallSummary,
    summary: {
      totalTransactions: filtered.length,
      totalProperties: propertyMap.size,
      propertiesWithMetrics: properties.filter(p => p.metrics != null).length,
      queryType,
      dateRange: { min: minDate, max: maxDate },
    },
    warnings,
    isPartialResult,
    capsTriggered,
  };

  res.json(response);
});

// ─── Query matcher builder ────────────────────────────────────────────────────

interface MatcherResult {
  queryType: string;
  matcher: (tx: CsvTransaction) => boolean;
}

function buildMatcher(rawQuery: string, warnings: string[]): MatcherResult {
  // Detect "STREET NAME, POSTCODE" pattern
  const commaIdx = rawQuery.lastIndexOf(',');
  if (commaIdx !== -1) {
    const streetPart = rawQuery.slice(0, commaIdx).trim();
    const postcodePart = rawQuery.slice(commaIdx + 1).trim().replace(/\s+/g, '');
    const normStreet = streetPart.toUpperCase().trim();
    return {
      queryType: `street "${streetPart}" in postcode starting "${postcodePart}"`,
      matcher: tx => {
        const pcNorm = tx.postcode.replace(/\s+/g, '').toUpperCase();
        return (
          tx.street.toUpperCase().includes(normStreet) &&
          pcNorm.startsWith(postcodePart.toUpperCase())
        );
      },
    };
  }

  // Postcode detection: starts with 1-2 letters, followed by digits
  const noSpaces = rawQuery.replace(/\s+/g, '');
  const isLikelyPostcode = /^[A-Z]{1,2}\d/.test(noSpaces);

  if (isLikelyPostcode) {
    // A full postcode's inward code is always [digit][A-Z][A-Z], e.g. "1AD"
    const isFullPostcode = /\d[A-Z]{2}$/.test(noSpaces);

    if (isFullPostcode) {
      const normFull = normalisePostcode(rawQuery);
      return {
        queryType: `full postcode ${normFull}`,
        matcher: tx => tx.postcode === normFull,
      };
    }

    // Partial postcode: sector (e.g. "SW11 1") or district (e.g. "SW11")
    const normPartial = noSpaces.toUpperCase();
    const label = /\d$/.test(noSpaces) && noSpaces.length > 4
      ? `postcode sector ${rawQuery}`
      : `postcode district ${rawQuery}`;
    return {
      queryType: label,
      matcher: tx => tx.postcode.replace(/\s+/g, '').toUpperCase().startsWith(normPartial),
    };
  }

  // Fall back to street name search
  warnings.push('Query treated as a street name. For accuracy, include a postcode qualifier: "STREET NAME, SW11".');
  const normStreet = rawQuery.toUpperCase().trim();
  return {
    queryType: `street name "${rawQuery}"`,
    matcher: tx => tx.street.toUpperCase().includes(normStreet),
  };
}

export default router;
