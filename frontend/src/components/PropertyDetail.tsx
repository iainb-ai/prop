import { PropertyRecord } from '../types';
import { formatGBP, formatPct, formatDate, formatYears, PROPERTY_TYPE_LABELS, ESTATE_TYPE_LABELS } from '../utils/format';
import MetricBadge from './MetricBadge';
import TransactionChart from './TransactionChart';

interface Props {
  record: PropertyRecord;
  onClose: () => void;
}

interface MetricRow {
  label: string;
  value: string;
  note?: string;
}

export default function PropertyDetail({ record, onClose }: Props) {
  const { address, transactions, metrics } = record;
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  const metricRows: MetricRow[] = metrics
    ? [
        { label: 'First sale', value: `${formatGBP(metrics.firstSalePrice)} on ${formatDate(metrics.firstSaleDate)}` },
        { label: 'Last sale', value: `${formatGBP(metrics.lastSalePrice)} on ${formatDate(metrics.lastSaleDate)}` },
        { label: 'Absolute change', value: formatGBP(metrics.absoluteChange), note: 'P1 − P0' },
        { label: 'Percent change', value: formatPct(metrics.percentChange, 1), note: '(P1−P0)/P0' },
        { label: 'Time elapsed', value: formatYears(metrics.yearsElapsed), note: '≈ ' + metrics.yearsElapsed.toFixed(2) + ' yrs' },
        { label: 'Avg £ per year', value: formatGBP(metrics.avgGbpPerYear), note: 'linear' },
        { label: 'Avg % per year', value: formatPct(metrics.avgPctPerYear, 2), note: 'linear' },
        { label: 'CAGR', value: formatPct(metrics.cagr, 2), note: '(P1/P0)^(1/Y)−1' },
      ]
    : [];

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{address.displayAddress}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{address.postcode}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Badges */}
      {metrics && <MetricBadge metrics={metrics} />}

      {/* Chart */}
      <TransactionChart transactions={sorted} />

      {/* Metrics table */}
      {metricRows.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Summary</h4>
          <table className="w-full text-sm">
            <tbody>
              {metricRows.map(row => (
                <tr key={row.label} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-500 w-1/2">
                    {row.label}
                    {row.note && (
                      <span className="ml-1 text-xs text-gray-300 font-mono">{row.note}</span>
                    )}
                  </td>
                  <td className="py-1.5 font-medium text-right">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!metrics && (
        <div className="text-sm text-gray-400 italic">
          Only one sale in range — change metrics cannot be computed.
        </div>
      )}

      {/* Transaction history */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
          Transaction History ({sorted.length})
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="pb-1 font-medium">Date</th>
                <th className="pb-1 font-medium text-right">Price</th>
                <th className="pb-1 font-medium">Type</th>
                <th className="pb-1 font-medium">Tenure</th>
                <th className="pb-1 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((tx, i) => {
                const isFirst = i === 0;
                const isLast = i === sorted.length - 1;
                return (
                  <tr
                    key={tx.id}
                    className={`border-t border-gray-50 ${
                      isFirst ? 'text-lr-green font-medium' :
                      isLast  ? 'text-red-600 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <td className="py-1.5">{formatDate(tx.date)}</td>
                    <td className="py-1.5 text-right">{formatGBP(tx.price)}</td>
                    <td className="py-1.5">
                      {PROPERTY_TYPE_LABELS[tx.propertyType] ?? tx.propertyType}
                      {tx.newBuild && (
                        <span className="ml-1 badge bg-blue-100 text-blue-700">New</span>
                      )}
                    </td>
                    <td className="py-1.5">{ESTATE_TYPE_LABELS[tx.estateType] ?? tx.estateType}</td>
                    <td className="py-1.5">
                      {tx.linkedDataUri ? (
                        <a
                          href={tx.linkedDataUri}
                          target="_blank"
                          rel="noreferrer"
                          className="text-lr-green underline"
                        >
                          ↗ LR
                        </a>
                      ) : '—'}
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
