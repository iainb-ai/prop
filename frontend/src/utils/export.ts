import type { PropertyRecord, GroupMetrics } from '../types';

function escapeCell(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCSV(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  return lines.join('\r\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPropertyMetrics(properties: PropertyRecord[]) {
  const headers = [
    'Address', 'Postcode', 'Sale Count',
    'First Sale Date', 'First Sale Price (£)',
    'Last Sale Date', 'Last Sale Price (£)',
    'Absolute Change (£)', 'Percent Change (%)', 'Years Elapsed',
    'Avg GBP/Year (£)', 'Avg %/Year (%)', 'CAGR (%)',
  ];
  const rows = properties.map(p => {
    const m = p.metrics;
    return [
      p.address.displayAddress, p.address.postcode, p.transactions.length,
      m?.firstDate ?? '', m?.firstPrice ?? '', m?.lastDate ?? '', m?.lastPrice ?? '',
      m?.absoluteChange ?? '', m ? (m.percentChange * 100).toFixed(2) : '',
      m?.yearsElapsed.toFixed(2) ?? '',
      m?.avgGbpPerYear.toFixed(0) ?? '',
      m ? (m.avgPctPerYear * 100).toFixed(2) : '',
      m ? (m.cagr * 100).toFixed(2) : '',
    ];
  });
  downloadCSV(toCSV(headers, rows), 'property-metrics.csv');
}

export function exportTransactions(properties: PropertyRecord[]) {
  const headers = [
    'Address', 'Postcode', 'Transaction Date', 'Price Paid (£)',
    'Property Type', 'Estate Type', 'New Build', 'Transaction ID', 'Source URI',
  ];
  const rows: unknown[][] = [];
  for (const p of properties) {
    for (const t of p.transactions) {
      const propTypeMap: Record<string, string> = { D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat/Maisonette', O: 'Other' };
      rows.push([
        p.address.displayAddress, p.address.postcode, t.date, t.price,
        propTypeMap[t.propertyType] ?? t.propertyType,
        t.estateType === 'F' ? 'Freehold' : 'Leasehold',
        t.newBuild ? 'Yes' : 'No',
        t.id, t.uri,
      ]);
    }
  }
  downloadCSV(toCSV(headers, rows), 'transactions.csv');
}

export function exportGroupSummary(groups: GroupMetrics[]) {
  const headers = [
    'Group', 'Properties', 'Included (≥2 sales)',
    'Mean Absolute Change (£)', 'Median Absolute Change (£)',
    'Mean % Change', 'Median % Change',
    'Mean GBP/Year (£)', 'Median GBP/Year (£)',
    'Mean CAGR (%)', 'Median CAGR (%)',
    'Min % Change', 'Max % Change',
    'Earliest Sale', 'Latest Sale',
  ];
  const rows = groups.map(g => [
    g.label, g.propertyCount, g.includedCount,
    g.meanAbsoluteChange.toFixed(0), g.medianAbsoluteChange.toFixed(0),
    (g.meanPercentChange * 100).toFixed(2), (g.medianPercentChange * 100).toFixed(2),
    g.meanAvgGbpPerYear.toFixed(0), g.medianAvgGbpPerYear.toFixed(0),
    (g.meanCagr * 100).toFixed(2), (g.medianCagr * 100).toFixed(2),
    (g.minPercentChange * 100).toFixed(2), (g.maxPercentChange * 100).toFixed(2),
    g.minFirstSaleDate, g.maxLastSaleDate,
  ]);
  downloadCSV(toCSV(headers, rows), 'group-summary.csv');
}
