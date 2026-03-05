import { SearchResponse } from '../types';
import { formatDate } from '../utils/format';

interface Props {
  result: SearchResponse;
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-bold text-lr-green">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ResultsOverview({ result }: Props) {
  const { summary, warnings, isPartialResult, capsTriggered } = result;

  return (
    <div className="space-y-3">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Properties"
          value={summary.totalProperties.toLocaleString()}
          sub={`${summary.propertiesWithMetrics} with ≥2 sales`}
        />
        <StatCard
          label="Transactions"
          value={summary.totalTransactions.toLocaleString()}
          sub={summary.queryType}
        />
        <StatCard
          label="Earliest sale"
          value={summary.dateRange ? formatDate(summary.dateRange.min) : '—'}
        />
        <StatCard
          label="Latest sale"
          value={summary.dateRange ? formatDate(summary.dateRange.max) : '—'}
        />
      </div>

      {/* Warnings */}
      {(isPartialResult || capsTriggered) && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
          <strong>Partial results:</strong> {capsTriggered
            ? 'The result cap was reached. Refine your search to see all data.'
            : 'Results may be incomplete.'}
        </div>
      )}
      {warnings.map((w, i) => (
        <div key={i} className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
          {w}
        </div>
      ))}
    </div>
  );
}
