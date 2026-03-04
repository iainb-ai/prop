import type { PropertyRecord } from '../types';
import TransactionChart from './TransactionChart';
import { formatGBP, formatPct, formatDate, formatYears, PROPERTY_TYPE_LABELS, ESTATE_TYPE_LABELS } from '../utils/format';

interface Props {
  property: PropertyRecord;
  onClose: () => void;
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex justify-between items-baseline py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-900">{value}</span>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function PropertyDetail({ property, onClose }: Props) {
  const { address, transactions, metrics } = property;
  const m = metrics;

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 leading-snug">{address.displayAddress}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{address.postcode}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Price chart */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Price History
        </h3>
        <TransactionChart
          transactions={transactions}
          firstDate={m?.firstDate}
          lastDate={m?.lastDate}
        />
      </div>

      {/* Summary metrics */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          First-to-last summary
          {m && (
            <span className="ml-2 normal-case font-normal text-gray-400">
              ({formatDate(m.firstDate)} → {formatDate(m.lastDate)})
            </span>
          )}
        </h3>

        {m ? (
          <div className="rounded-lg bg-gray-50 px-4 divide-y divide-gray-100">
            <MetricRow
              label="First sale"
              value={formatGBP(m.firstPrice)}
              sub={formatDate(m.firstDate)}
            />
            <MetricRow
              label="Last sale"
              value={formatGBP(m.lastPrice)}
              sub={formatDate(m.lastDate)}
            />
            <MetricRow
              label="Absolute change"
              value={formatGBP(m.absoluteChange)}
            />
            <MetricRow
              label="Percent change"
              value={formatPct(m.percentChange)}
              sub={`≈ ${Math.round(m.percentChange * 100)}% rounded`}
            />
            <MetricRow
              label="Time elapsed"
              value={formatYears(m.yearsElapsed)}
              sub={`${m.firstDate} → ${m.lastDate}`}
            />
            <MetricRow
              label="Avg change / year (linear)"
              value={`${formatGBP(m.avgGbpPerYear)} · ${formatPct(m.avgPctPerYear)}`}
            />
            <MetricRow
              label="CAGR"
              value={formatPct(m.cagr)}
              sub="Compound annual growth rate"
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic bg-gray-50 rounded-lg px-4 py-3">
            Only one sale in the selected date range — change metrics cannot be calculated.
          </p>
        )}
      </div>

      {/* Transaction table */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          All transactions ({transactions.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 text-xs text-gray-500 font-medium">Date</th>
                <th className="text-right py-2 pr-4 text-xs text-gray-500 font-medium">Price</th>
                <th className="text-left py-2 pr-4 text-xs text-gray-500 font-medium">Type</th>
                <th className="text-left py-2 text-xs text-gray-500 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => {
                const isFirst = i === 0 && m;
                const isLast = i === transactions.length - 1 && m && transactions.length > 1;
                return (
                  <tr
                    key={tx.id}
                    className={`border-b border-gray-100 last:border-0 ${
                      isFirst ? 'bg-green-50' : isLast ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="py-2 pr-4 text-gray-700">
                      {formatDate(tx.date)}
                      {tx.newBuild && (
                        <span className="ml-1 badge bg-blue-100 text-blue-700 text-[10px]">New</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-gray-900">
                      {formatGBP(tx.price)}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 text-xs">
                      {PROPERTY_TYPE_LABELS[tx.propertyType] ?? tx.propertyType} ·{' '}
                      {ESTATE_TYPE_LABELS[tx.estateType] ?? tx.estateType}
                    </td>
                    <td className="py-2">
                      {tx.uri ? (
                        <a
                          href={tx.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-lr-green hover:underline"
                        >
                          View record ↗
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
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
