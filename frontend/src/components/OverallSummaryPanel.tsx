import { OverallSummary, PropertyTypeSummary } from '../types';
import { formatGBP, formatPct } from '../utils/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

interface Props {
  summary: OverallSummary;
}

function pctColor(v: number) {
  return v >= 0 ? '#006e39' : '#dc2626';
}

function SummaryRow({ row, highlight }: { row: PropertyTypeSummary; highlight?: boolean }) {
  const hasData = row.includedCount > 0;
  return (
    <tr className={`border-t border-gray-100 ${highlight ? 'bg-lr-light font-semibold' : 'hover:bg-gray-50'}`}>
      <td className="py-2 pr-4 whitespace-nowrap">{row.label}</td>
      <td className="py-2 px-3 text-right text-gray-500">{row.totalProperties}</td>
      <td className="py-2 px-3 text-right text-gray-500">{row.includedCount}</td>
      {/* Mean £/yr */}
      <td className="py-2 px-3 text-right">
        {hasData ? formatGBP(row.meanAvgGbpPerYear) : '—'}
      </td>
      {/* Median £/yr */}
      <td className="py-2 px-3 text-right">
        {hasData ? formatGBP(row.medianAvgGbpPerYear) : '—'}
      </td>
      {/* Mean %/yr */}
      <td className={`py-2 px-3 text-right ${hasData ? (row.meanAvgPctPerYear >= 0 ? 'text-green-700' : 'text-red-600') : ''}`}>
        {hasData ? formatPct(row.meanAvgPctPerYear, 2) : '—'}
      </td>
      {/* Median %/yr */}
      <td className={`py-2 px-3 text-right font-medium ${hasData ? (row.medianAvgPctPerYear >= 0 ? 'text-green-700' : 'text-red-600') : ''}`}>
        {hasData ? formatPct(row.medianAvgPctPerYear, 2) : '—'}
      </td>
      {/* Mean CAGR */}
      <td className={`py-2 px-3 text-right ${hasData ? (row.meanCagr >= 0 ? 'text-green-700' : 'text-red-600') : ''}`}>
        {hasData ? formatPct(row.meanCagr, 2) : '—'}
      </td>
    </tr>
  );
}

export default function OverallSummaryPanel({ summary }: Props) {
  const { all, byPropertyType } = summary;

  // Chart data: median £/yr and median %/yr by property type
  const chartData = byPropertyType
    .filter(r => r.includedCount > 0)
    .map(r => ({
      name: r.label,
      'Median £/yr': Math.round(r.medianAvgGbpPerYear),
      'Median %/yr': parseFloat((r.medianAvgPctPerYear * 100).toFixed(2)),
    }));

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-gray-900">Price Change Summary — All Matched Properties</h3>

      {/* Headline stats */}
      {all.includedCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold" style={{ color: pctColor(all.medianAvgGbpPerYear) }}>
              {formatGBP(all.medianAvgGbpPerYear)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Median £/yr (all)</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold" style={{ color: pctColor(all.medianAvgPctPerYear) }}>
              {formatPct(all.medianAvgPctPerYear, 2)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Median %/yr (all)</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold" style={{ color: pctColor(all.meanAvgGbpPerYear) }}>
              {formatGBP(all.meanAvgGbpPerYear)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Mean £/yr (all)</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold" style={{ color: pctColor(all.meanCagr) }}>
              {formatPct(all.meanCagr, 2)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Mean CAGR (all)</div>
          </div>
        </div>
      )}

      {all.includedCount === 0 && (
        <p className="text-sm text-gray-400 italic">
          No properties with at least 2 sales — change metrics cannot be computed.
        </p>
      )}

      {/* Bar chart — only if multiple property types */}
      {chartData.length > 1 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Median annual change by property type</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* £/yr chart */}
            <div>
              <p className="text-xs text-gray-400 text-center mb-1">£/yr</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `£${Math.round(v / 1000)}k`} tick={{ fontSize: 10 }} width={50} />
                  <Tooltip formatter={(v: number) => formatGBP(v)} />
                  <Bar dataKey="Median £/yr" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d['Median £/yr'] >= 0 ? '#006e39' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* %/yr chart */}
            <div>
              <p className="text-xs text-gray-400 text-center mb-1">%/yr</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 10 }} width={40} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                  <Bar dataKey="Median %/yr" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d['Median %/yr'] >= 0 ? '#2563eb' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown table */}
      {byPropertyType.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-200">
                <th className="pb-2 font-medium">Property type</th>
                <th className="pb-2 font-medium text-right">Total</th>
                <th className="pb-2 font-medium text-right">Incl.</th>
                <th className="pb-2 font-medium text-right">Mean £/yr</th>
                <th className="pb-2 font-medium text-right">Median £/yr</th>
                <th className="pb-2 font-medium text-right">Mean %/yr</th>
                <th className="pb-2 font-medium text-right">Median %/yr</th>
                <th className="pb-2 font-medium text-right">Mean CAGR</th>
              </tr>
            </thead>
            <tbody>
              {byPropertyType.map(row => (
                <SummaryRow key={row.propertyType} row={row} />
              ))}
              <SummaryRow row={all} highlight />
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">
            Incl. = properties with ≥2 sales. Metrics computed per property (first-to-last sale),
            then averaged across included properties.
          </p>
        </div>
      )}
    </div>
  );
}
