import { PropertyMetrics } from '../types';
import { formatGBP, formatPct, formatYears } from '../utils/format';

interface Props {
  metrics: PropertyMetrics;
  compact?: boolean;
}

export default function MetricBadge({ metrics, compact = false }: Props) {
  const positive = metrics.percentChange >= 0;
  const colorClass = positive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';

  if (compact) {
    return (
      <span className={`badge ${colorClass}`}>
        {formatPct(metrics.percentChange, 0)}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className={`badge ${colorClass}`}>{formatPct(metrics.percentChange, 1)}</span>
      <span className="badge bg-gray-100 text-gray-700">{formatGBP(metrics.absoluteChange)}</span>
      <span className="badge bg-blue-100 text-blue-800">CAGR {formatPct(metrics.cagr, 1)}</span>
      <span className="badge bg-gray-100 text-gray-700">{formatYears(metrics.yearsElapsed)}</span>
    </div>
  );
}
