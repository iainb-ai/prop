import { formatDuration } from '../utils/format';

interface Props {
  label: string;
  progress: number;
  indeterminate?: boolean;
  elapsedSec?: number;
  etaSeconds?: number | null;
  detail?: string;
}

export default function ProgressBar({ label, progress, indeterminate, elapsedSec, etaSeconds, detail }: Props) {
  const timing = [
    elapsedSec !== undefined ? `${formatDuration(elapsedSec)} elapsed` : null,
    indeterminate ? null
      : etaSeconds != null ? `about ${formatDuration(etaSeconds)} remaining`
      : 'estimating time remaining…',
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <div className="flex justify-between gap-3 text-xs text-gray-600 mb-1">
        <span>{label}</span>
        {!indeterminate && <span className="shrink-0">{progress}%</span>}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full bg-lr-green rounded-full transition-all duration-500 ${indeterminate ? 'animate-pulse' : ''}`}
          style={{ width: `${indeterminate ? Math.max(progress, 5) : progress}%` }}
        />
      </div>
      <div className="flex justify-between gap-3 text-xs text-gray-400 mt-1">
        <span>{timing}</span>
        {detail && <span className="shrink-0">{detail}</span>}
      </div>
    </div>
  );
}
