import { PropertyRecord, GroupMetrics } from '../types';

function escapeCell(v: string | number | boolean | undefined | null): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map(r => r.map(escapeCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPropertyMetrics(properties: PropertyRecord[]): void {
  const headers = [
    'Address', 'Postcode', 'Sale Count',
    'First Sale Date', 'First Sale Price',
    'Last Sale Date', 'Last Sale Price',
    'Absolute Change (£)', 'Percent Change (%)',
    'Years Elapsed', 'Avg £/yr', 'Avg %/yr', 'CAGR (%)',
  ];
  const rows = properties.map(p => {
    const m = p.metrics;
    return [
      p.address.displayAddress,
      p.address.postcode,
      String(p.transactions.length),
      m?.firstSaleDate ?? '',
      m ? String(m.firstSalePrice) : '',
      m?.lastSaleDate ?? '',
      m ? String(m.lastSalePrice) : '',
      m ? String(Math.round(m.absoluteChange)) : '',
      m ? (m.percentChange * 100).toFixed(2) : '',
      m ? m.yearsElapsed.toFixed(2) : '',
      m ? Math.round(m.avgGbpPerYear).toString() : '',
      m ? (m.avgPctPerYear * 100).toFixed(2) : '',
      m ? (m.cagr * 100).toFixed(2) : '',
    ];
  });
  downloadCsv('property-metrics.csv', [headers, ...rows]);
}

export function exportTransactions(properties: PropertyRecord[]): void {
  const headers = [
    'Address', 'Postcode', 'Date', 'Price (£)',
    'Property Type', 'Estate Type', 'New Build',
    'Transaction Category', 'Transaction ID', 'Linked Data URI',
  ];
  const rows = properties.flatMap(p =>
    p.transactions.map(t => [
      p.address.displayAddress,
      p.address.postcode,
      t.date,
      String(t.price),
      t.propertyType,
      t.estateType,
      t.newBuild ? 'Y' : 'N',
      t.transactionCategory,
      t.id,
      t.linkedDataUri,
    ]),
  );
  downloadCsv('transactions.csv', [headers, ...rows]);
}

export function exportGroupSummary(groups: GroupMetrics[]): void {
  const headers = [
    'Group', 'Properties', 'Included (≥2 sales)',
    'Mean % Change', 'Median % Change',
    'Mean £/yr', 'Mean CAGR (%)',
    'Min % Change', 'Max % Change',
    'Earliest Sale', 'Latest Sale',
  ];
  const rows = groups.map(g => [
    g.groupLabel,
    String(g.propertyCount),
    String(g.includedCount),
    (g.meanPercentChange * 100).toFixed(2),
    (g.medianPercentChange * 100).toFixed(2),
    Math.round(g.meanAvgGbpPerYear).toString(),
    (g.meanCagr * 100).toFixed(2),
    (g.minPercentChange * 100).toFixed(2),
    (g.maxPercentChange * 100).toFixed(2),
    g.minFirstSaleDate,
    g.maxLastSaleDate,
  ]);
  downloadCsv('group-summary.csv', [headers, ...rows]);
}
