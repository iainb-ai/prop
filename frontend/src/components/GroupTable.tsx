import { GroupMetrics } from '../types';
import { formatGBP, formatPct, formatDate } from '../utils/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

interface Props {
  groups: GroupMetrics[];
}

function barColor(pct: number): string {
  if (pct > 0.5) return '#006e39';
  if (pct > 0.2) return '#d97706';
  if (pct >= 0) return '#92400e';
  return '#dc2626';
}

export default function GroupTable({ groups }: Props) {
  const top20 = [...groups]
    .sort((a, b) => b.includedCount - a.includedCount)
    .slice(0, 20);

  return (
    <div className="space-y-4">
      {/* Bar chart */}
      {top20.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Median % Change by Group (top {top20.length})
          </h4>
          <ResponsiveContainer width="100%" height={Math.max(200, top20.length * 28)}>
            <BarChart
              data={top20}
              layout="vertical"
              margin={{ top: 4, right: 40, bottom: 4, left: 120 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="groupLabel"
                width={115}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(v: number) => formatPct(v, 1)}
                labelFormatter={l => `Group: ${l}`}
              />
              <Bar dataKey="medianPercentChange" radius={[0, 3, 3, 0]}>
                {top20.map((g, i) => (
                  <Cell key={i} fill={barColor(g.medianPercentChange)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="pb-2 font-medium">Group</th>
              <th className="pb-2 font-medium text-right">Properties</th>
              <th className="pb-2 font-medium text-right">Incl.</th>
              <th className="pb-2 font-medium text-right">Mean %</th>
              <th className="pb-2 font-medium text-right">Median %</th>
              <th className="pb-2 font-medium text-right">Mean £/yr</th>
              <th className="pb-2 font-medium text-right">CAGR</th>
              <th className="pb-2 font-medium text-right">Min %</th>
              <th className="pb-2 font-medium text-right">Max %</th>
              <th className="pb-2 font-medium">Date span</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.groupKey} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="py-2 font-medium">{g.groupLabel}</td>
                <td className="py-2 text-right">{g.propertyCount}</td>
                <td className="py-2 text-right">{g.includedCount}</td>
                <td className={`py-2 text-right ${g.meanPercentChange >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {g.includedCount > 0 ? formatPct(g.meanPercentChange, 1) : '—'}
                </td>
                <td className={`py-2 text-right font-medium ${g.medianPercentChange >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {g.includedCount > 0 ? formatPct(g.medianPercentChange, 1) : '—'}
                </td>
                <td className="py-2 text-right">
                  {g.includedCount > 0 ? formatGBP(g.meanAvgGbpPerYear) : '—'}
                </td>
                <td className="py-2 text-right">
                  {g.includedCount > 0 ? formatPct(g.meanCagr, 1) : '—'}
                </td>
                <td className="py-2 text-right text-red-600">
                  {g.includedCount > 0 ? formatPct(g.minPercentChange, 1) : '—'}
                </td>
                <td className="py-2 text-right text-green-700">
                  {g.includedCount > 0 ? formatPct(g.maxPercentChange, 1) : '—'}
                </td>
                <td className="py-2 text-gray-400">
                  {g.minFirstSaleDate
                    ? `${formatDate(g.minFirstSaleDate)} – ${formatDate(g.maxLastSaleDate)}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
