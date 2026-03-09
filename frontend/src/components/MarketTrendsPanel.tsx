import { useState } from 'react';
import { MarketTrends, PropertyTypeTrend } from '../types';
import { formatGBP, formatPct } from '../utils/format';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

interface Props {
  trends: MarketTrends;
}

type Tab = 'prices' | 'yoy' | 'index' | 'volume';

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: 'prices', label: 'Avg Prices',    desc: 'Average sale price per year by property type' },
  { key: 'yoy',    label: 'YoY % Change', desc: 'Year-on-year % change in average price' },
  { key: 'index',  label: 'Price Index',  desc: 'Price index rebased to 100 at earliest year' },
  { key: 'volume', label: 'Sales Volume', desc: 'Number of transactions per year' },
];

// Build a chart-friendly row array merging all trends onto a shared year axis
function buildChartData(
  trends: PropertyTypeTrend[],
  tab: Tab,
): Array<Record<string, number | null>> {
  const allYears = [...new Set(
    trends.flatMap(t => t.dataPoints.map(d => d.year))
  )].sort((a, b) => a - b);

  return allYears.map(year => {
    const row: Record<string, number | null> = { year };
    for (const trend of trends) {
      const pt = trend.dataPoints.find(d => d.year === year);
      if (!pt) { row[trend.label] = null; continue; }
      switch (tab) {
        case 'prices': row[trend.label] = pt.medianPrice; break;
        case 'yoy':    row[trend.label] = pt.yoyPctChange !== null ? +(pt.yoyPctChange * 100).toFixed(2) : null; break;
        case 'index':  row[trend.label] = pt.priceIndex !== null ? +pt.priceIndex.toFixed(1) : null; break;
        case 'volume': row[trend.label] = pt.count; break;
      }
    }
    return row;
  });
}

function yAxisFormatter(tab: Tab) {
  return (v: number) => {
    if (tab === 'prices')  return `£${Math.round(v / 1000)}k`;
    if (tab === 'yoy')     return `${v.toFixed(1)}%`;
    if (tab === 'index')   return v.toFixed(0);
    return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
  };
}

function tooltipFormatter(tab: Tab, value: number, name: string) {
  if (tab === 'prices')  return [formatGBP(value), name];
  if (tab === 'yoy')     return [`${value >= 0 ? '+' : ''}${value.toFixed(2)}%`, name];
  if (tab === 'index')   return [`${value.toFixed(1)}`, name];
  return [value.toLocaleString(), name];
}

// Compute a tight Y-axis domain from visible series data, with padding.
function computeYDomain(
  data: Array<Record<string, number | null>>,
  seriesKeys: string[],
  tab: Tab,
): [number, number] | undefined {
  const values: number[] = [];
  for (const row of data) {
    for (const k of seriesKeys) {
      const v = row[k];
      if (v !== null && v !== undefined) values.push(v as number);
    }
  }
  if (values.length === 0) return undefined;

  let lo = Math.min(...values);
  let hi = Math.max(...values);

  // Always include 0 on YoY tab; always include 100 on index tab
  if (tab === 'yoy')   { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (tab === 'index') { lo = Math.min(lo, 100); hi = Math.max(hi, 100); }

  const range = hi - lo || Math.abs(hi) || 1;
  const pad   = range * 0.08;
  return [lo - pad, hi + pad];
}

export default function MarketTrendsPanel({ trends }: Props) {
  const [activeTab, setActiveTab]     = useState<Tab>('prices');
  const [showCombined, setShowCombined] = useState(false);
  // Hidden types — 'O' (Other) is hidden by default
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(() => new Set(['O']));

  if (trends.totalTransactions === 0) return null;

  function toggleType(pt: string) {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      next.has(pt) ? next.delete(pt) : next.add(pt);
      return next;
    });
  }

  // Available per-type trends that have data
  const availableTypes = trends.byPropertyType.filter(t => t.dataPoints.length > 0);

  // Visible trends for the chart
  const trendsToShow = showCombined
    ? [trends.combined]
    : availableTypes.filter(t => !hiddenTypes.has(t.propertyType));

  const chartData    = buildChartData(trendsToShow, activeTab);
  const seriesKeys   = trendsToShow.map(t => t.label);
  const yDomain      = computeYDomain(chartData, seriesKeys, activeTab);
  const fmt          = yAxisFormatter(activeTab);

  // Summary table rows — one per type, sorted by CAGR desc
  const summaryRows = [...trends.byPropertyType]
    .filter(t => t.cagr !== null)
    .sort((a, b) => (b.cagr ?? 0) - (a.cagr ?? 0));

  const baseYear = trends.yearRange.min;
  const latestYear = trends.yearRange.max;

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">Market Trends</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {trends.totalTransactions.toLocaleString()} transactions · {baseYear}–{latestYear}
            {trends.isTruncated && <span className="ml-1 text-amber-500">⚠ truncated</span>}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showCombined}
            onChange={e => setShowCombined(e.target.checked)}
            className="rounded border-gray-300 text-lr-green focus:ring-lr-green"
          />
          Combined (all types)
        </label>
      </div>

      {/* Per-type toggles — hidden when "Combined" is active */}
      {!showCombined && availableTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableTypes.map(trend => {
            const visible = !hiddenTypes.has(trend.propertyType);
            return (
              <button
                key={trend.propertyType}
                onClick={() => toggleType(trend.propertyType)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                style={visible
                  ? { backgroundColor: trend.color, borderColor: trend.color, color: '#fff' }
                  : { backgroundColor: '#fff', borderColor: '#d1d5db', color: '#9ca3af' }
                }
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: visible ? '#fff' : trend.color }}
                />
                {trend.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-lr-green text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 -mt-2">
        {TABS.find(t => t.key === activeTab)?.desc}
      </p>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={fmt}
            tick={{ fontSize: 11 }}
            width={58}
            domain={yDomain ?? ['auto', 'auto']}
            allowDataOverflow={false}
          />
          <Tooltip
            formatter={(value: number, name: string) => tooltipFormatter(activeTab, value, name)}
            labelFormatter={year => `Year: ${year}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {activeTab === 'yoy' && <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 2" />}
          {activeTab === 'index' && <ReferenceLine y={100} stroke="#9ca3af" strokeDasharray="4 2" />}
          {trendsToShow.map(trend => (
            <Line
              key={trend.propertyType}
              type="monotone"
              dataKey={trend.label}
              stroke={trend.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Summary table */}
      {summaryRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-200">
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium text-right">Transactions</th>
                <th className="pb-2 font-medium text-right">{baseYear} avg</th>
                <th className="pb-2 font-medium text-right">{latestYear} avg</th>
                <th className="pb-2 font-medium text-right">Total change</th>
                <th className="pb-2 font-medium text-right">CAGR</th>
                <th className="pb-2 font-medium text-right">Best yr</th>
                <th className="pb-2 font-medium text-right">Worst yr</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map(trend => {
                const firstPt = trend.dataPoints[0];
                const lastPt  = trend.dataPoints[trend.dataPoints.length - 1];
                const totalChg = firstPt && lastPt
                  ? (lastPt.medianPrice - firstPt.medianPrice) / firstPt.medianPrice
                  : null;

                const withYoy = trend.dataPoints.filter(d => d.yoyPctChange !== null);
                const bestPt  = withYoy.length > 0 ? withYoy.reduce((a, b) => (b.yoyPctChange! > a.yoyPctChange! ? b : a)) : null;
                const worstPt = withYoy.length > 0 ? withYoy.reduce((a, b) => (b.yoyPctChange! < a.yoyPctChange! ? b : a)) : null;

                return (
                  <tr key={trend.propertyType} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="py-2 font-medium flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: trend.color }} />
                      {trend.label}
                    </td>
                    <td className="py-2 text-right">{trend.totalTransactions.toLocaleString()}</td>
                    <td className="py-2 text-right">{firstPt ? formatGBP(firstPt.medianPrice) : '—'}</td>
                    <td className="py-2 text-right">{lastPt  ? formatGBP(lastPt.medianPrice)  : '—'}</td>
                    <td className={`py-2 text-right font-medium ${totalChg !== null ? (totalChg >= 0 ? 'text-green-700' : 'text-red-600') : ''}`}>
                      {totalChg !== null ? formatPct(totalChg, 1) : '—'}
                    </td>
                    <td className={`py-2 text-right ${trend.cagr !== null ? (trend.cagr >= 0 ? 'text-green-700' : 'text-red-600') : ''}`}>
                      {trend.cagr !== null ? formatPct(trend.cagr, 2) : '—'}
                    </td>
                    <td className="py-2 text-right text-green-700">
                      {bestPt ? `${bestPt.year} (${formatPct(bestPt.yoyPctChange!, 1)})` : '—'}
                    </td>
                    <td className="py-2 text-right text-red-600">
                      {worstPt ? `${worstPt.year} (${formatPct(worstPt.yoyPctChange!, 1)})` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
