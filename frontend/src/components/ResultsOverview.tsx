import type { SearchResponse } from '../types';
import { formatDate } from '../utils/format';

interface Props {
  result: SearchResponse;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-white ring-1 ring-gray-200 p-4">
      <p className="text-2xl font-bold text-lr-green">{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const QUERY_TYPE_LABELS = {
  fullPostcode: 'Full postcode',
  partialPostcode: 'Partial postcode',
  street: 'Street search',
};

export default function ResultsOverview({ result }: Props) {
  const { summary, warnings, isPartialResult, capsTriggered } = result;

  return (
    <div className="space-y-3">
      {/* Warnings / flags */}
      {(isPartialResult || capsTriggered) && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <svg className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.539-1.333-3.31 0L3.16 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {capsTriggered ? 'Result cap reached' : 'Incomplete results'}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Results are incomplete. Try a more specific postcode or street to see full data.
            </p>
          </div>
        </div>
      )}

      {warnings.map((w, i) => (
        <div key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {w}
        </div>
      ))}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Properties"
          value={summary.totalProperties}
          sub={`${summary.propertiesWithMultipleSales} with ≥2 sales`}
        />
        <StatCard
          label="Transactions"
          value={summary.totalTransactions}
          sub={QUERY_TYPE_LABELS[summary.queryType]}
        />
        <StatCard
          label="Earliest sale"
          value={formatDate(summary.dateMin)}
        />
        <StatCard
          label="Latest sale"
          value={formatDate(summary.dateMax)}
        />
      </div>
    </div>
  );
}
