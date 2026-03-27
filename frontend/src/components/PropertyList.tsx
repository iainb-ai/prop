import { FixedSizeList } from 'react-window';
import type { ListChildComponentProps } from 'react-window';
import { PropertyRecord } from '../types';
import MetricBadge from './MetricBadge';
import { formatGBP, formatDate, PROPERTY_TYPE_LABELS } from '../utils/format';

interface Props {
  properties: PropertyRecord[];
  selectedKey: string | null;
  onSelect: (record: PropertyRecord) => void;
}

const ITEM_HEIGHT = 80;

export default function PropertyList({ properties, selectedKey, onSelect }: Props) {
  if (properties.length === 0) {
    return (
      <div className="card text-center text-gray-400 text-sm py-8">
        No properties found.
      </div>
    );
  }

  function Row({ index, style }: ListChildComponentProps) {
    const p = properties[index];
    const lastTx = p.transactions[p.transactions.length - 1];
    const ptLabel = PROPERTY_TYPE_LABELS[lastTx?.propertyType ?? ''] ?? '—';
    const isSelected = p.propertyKey === selectedKey;
    const saleCount = p.metrics?.transactionCount ?? p.transactions.length;

    return (
      <div style={style} className="pr-1">
        <button
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
                {ptLabel} · {saleCount} sale{saleCount !== 1 ? 's' : ''}
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
      </div>
    );
  }

  const listHeight = Math.min(properties.length * ITEM_HEIGHT, 600);

  return (
    <FixedSizeList
      height={listHeight}
      itemCount={properties.length}
      itemSize={ITEM_HEIGHT}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
