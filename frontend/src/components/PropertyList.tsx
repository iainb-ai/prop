import { PropertyRecord } from '../types';
import MetricBadge from './MetricBadge';
import { formatGBP, formatDate, PROPERTY_TYPE_LABELS } from '../utils/format';

interface Props {
  properties: PropertyRecord[];
  selectedKey: string | null;
  onSelect: (record: PropertyRecord) => void;
}

export default function PropertyList({ properties, selectedKey, onSelect }: Props) {
  if (properties.length === 0) {
    return (
      <div className="card text-center text-gray-400 text-sm py-8">
        No properties found.
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
      {properties.map(p => {
        const lastTx = p.transactions[p.transactions.length - 1];
        const ptLabel = PROPERTY_TYPE_LABELS[lastTx?.propertyType ?? ''] ?? '—';
        const isSelected = p.propertyKey === selectedKey;

        return (
          <button
            key={p.propertyKey}
            onClick={() => onSelect(p)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              isSelected
                ? 'border-lr-green bg-lr-light'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.address.displayAddress}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ptLabel} · {p.transactions.length} sale{p.transactions.length !== 1 ? 's' : ''}
                  {lastTx && ` · Last: ${formatGBP(lastTx.price)} on ${formatDate(lastTx.date)}`}
                </p>
              </div>
              {p.metrics && (
                <div className="flex-shrink-0">
                  <MetricBadge metrics={p.metrics} compact />
                </div>
              )}
            </div>
            {!p.metrics && (
              <span className="text-xs text-gray-400 italic">Only one sale in range</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
