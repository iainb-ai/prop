import { formatGBP, formatPct } from '../utils/format';

interface Props {
  metrics?: {
    percentChange: number;
    absoluteChange: number;
    cagr: number;
    yearsElapsed: number;
    avgPctPerYear: number;
  };
  compact?: boolean;
}

export default function MetricBadge({ metrics, compact = false }: Props) {
  if (!metrics) {
    return (
      <span className="badge bg-gray-100 text-gray-500">Only one sale in range</span>
    );
  }

  const pct = metrics.percentChange;
  const positive = pct >= 0;

  if (compact) {
    return (
      <span className={`badge ${positive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        {formatPct(pct)} total
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <span className={`badge ${positive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        {formatPct(pct)} total
      </span>
      <span className="badge bg-blue-100 text-blue-800">
        {formatGBP(metrics.absoluteChange)} change
      </span>
      <span className="badge bg-purple-100 text-purple-800">
        CAGR {formatPct(metrics.cagr)}
      </span>
      <span className="badge bg-gray-100 text-gray-700">
        {metrics.yearsElapsed.toFixed(1)} yrs
      </span>
    </div>
  );
}
