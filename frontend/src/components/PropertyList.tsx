import type { PropertyRecord } from '../types';
import MetricBadge from './MetricBadge';
import { formatGBP, formatDate, PROPERTY_TYPE_LABELS } from '../utils/format';

interface Props {
  properties: PropertyRecord[];
  onSelect: (property: PropertyRecord) => void;
  selected?: string; // addressId
}

export default function PropertyList({ properties, onSelect, selected }: Props) {
  if (properties.length === 0) {
    return <p className="text-sm text-gray-500 italic">No properties found.</p>;
  }

  return (
    <div className="space-y-2">
      {properties.map(prop => {
        const isSelected = prop.addressId === selected;
        const lastTx = prop.transactions[prop.transactions.length - 1];
        const propType = prop.transactions[0]?.propertyType;

        return (
          <button
            key={prop.addressId}
            onClick={() => onSelect(prop)}
            className={`w-full text-left rounded-lg border px-4 py-3 transition-all hover:shadow-md ${
              isSelected
                ? 'border-lr-green bg-lr-light ring-1 ring-lr-green'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate text-sm">
                  {prop.address.displayAddress}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {prop.transactions.length} sale{prop.transactions.length !== 1 ? 's' : ''}
                  {propType && ` · ${PROPERTY_TYPE_LABELS[propType] ?? propType}`}
                  {lastTx && ` · Last: ${formatGBP(lastTx.price)} (${formatDate(lastTx.date)})`}
                </p>
              </div>
              <div className="flex-shrink-0">
                <MetricBadge metrics={prop.metrics} compact />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
