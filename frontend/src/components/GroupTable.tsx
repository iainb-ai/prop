import type { GroupMetrics } from '../types';
import { formatGBP, formatPct, formatDate } from '../utils/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

interface Props {
  groups: GroupMetrics[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload as GroupMetrics;
  return (
    <div className="rounded-lg bg-white shadow-lg ring-1 ring-gray-200 p-3 text-xs max-w-xs">
      <p className="font-semibold text-gray-900 mb-1">{g.label}</p>
      <p>Mean % change: <strong>{formatPct(g.meanPercentChange)}</strong></p>
      <p>Median % change: <strong>{formatPct(g.medianPercentChange)}</strong></p>
      <p>Mean CAGR: <strong>{formatPct(g.meanCagr)}</strong></p>
      <p>Properties included: <strong>{g.includedCount} / {g.propertyCount}</strong></p>
    </div>
  );
}

function colorForPct(pct: number): string {
  if (pct > 0.5) return '#006e39';
  if (pct > 0.2) return '#22c55e';
  if (pct > 0) return '#86efac';
  if (pct > -0.1) return '#fca5a5';
  return '#dc2626';
}

export default function GroupTable({ groups }: Props) {
  if (groups.length === 0) {
    return null;
  }

  const chartData = groups.slice(0, 20); // cap for readability

  return (
    <div className="space-y-5">
      {/* Bar chart – median % change by group */}
      {groups.length > 1 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Median % change by group
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 10 }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 10 }}
                width={120}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="medianPercentChange" radius={[0, 4, 4, 0]}>
                {chartData.map(g => (
                  <Cell key={g.key} fill={colorForPct(g.medianPercentChange)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data table */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Group summary table
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 pr-3 font-medium text-gray-600">Group</th>
                <th className="text-right py-2 pr-3 font-medium text-gray-600">Props</th>
                <th className="text-right py-2 pr-3 font-medium text-gray-600">Incl.</th>
                <th className="text-right py-2 pr-3 font-medium text-gray-600">Mean Δ%</th>
                <th className="text-right py-2 pr-3 font-medium text-gray-600">Median Δ%</th>
                <th className="text-right py-2 pr-3 font-medium text-gray-600">Mean Δ£/yr</th>
                <th className="text-right py-2 pr-3 font-medium text-gray-600">Mean CAGR</th>
                <th className="text-right py-2 pr-3 font-medium text-gray-600">Min / Max Δ%</th>
                <th className="text-right py-2 font-medium text-gray-600">Date span</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const pct = g.meanPercentChange;
                const positive = pct >= 0;
                return (
                  <tr key={g.key} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-3 font-medium text-gray-800 max-w-[180px] truncate">{g.label}</td>
                    <td className="py-2 pr-3 text-right text-gray-600">{g.propertyCount}</td>
                    <td className="py-2 pr-3 text-right text-gray-600">{g.includedCount}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${positive ? 'text-green-700' : 'text-red-700'}`}>
                      {formatPct(g.meanPercentChange)}
                    </td>
                    <td className={`py-2 pr-3 text-right ${positive ? 'text-green-700' : 'text-red-700'}`}>
                      {formatPct(g.medianPercentChange)}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-700">{formatGBP(g.meanAvgGbpPerYear)}/yr</td>
                    <td className="py-2 pr-3 text-right text-gray-700">{formatPct(g.meanCagr)}</td>
                    <td className="py-2 pr-3 text-right text-gray-500">
                      {formatPct(g.minPercentChange)} / {formatPct(g.maxPercentChange)}
                    </td>
                    <td className="py-2 text-right text-gray-400 whitespace-nowrap">
                      {formatDate(g.minFirstSaleDate)} – {formatDate(g.maxLastSaleDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
