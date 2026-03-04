import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Dot,
} from 'recharts';
import type { Transaction } from '../types';
import { formatGBP, formatDate } from '../utils/format';

interface Props {
  transactions: Transaction[];
  firstDate?: string;
  lastDate?: string;
}

interface ChartPoint {
  date: string;
  price: number;
  label: string;
  newBuild: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartPoint;
  return (
    <div className="rounded-lg bg-white shadow-lg ring-1 ring-gray-200 p-3 text-sm">
      <p className="font-semibold text-gray-900">{formatGBP(d.price)}</p>
      <p className="text-gray-500 text-xs mt-0.5">{formatDate(d.date)}</p>
      {d.newBuild && (
        <span className="badge bg-blue-100 text-blue-700 mt-1">New build</span>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomDot(props: any) {
  const { cx, cy, payload } = props;
  if (!cx || !cy) return null;
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={payload.newBuild ? 7 : 5}
      fill={payload.newBuild ? '#3b82f6' : '#006e39'}
      stroke="white"
      strokeWidth={2}
    />
  );
}

export default function TransactionChart({ transactions, firstDate, lastDate }: Props) {
  const data: ChartPoint[] = transactions.map(t => ({
    date: t.date,
    price: t.price,
    label: formatDate(t.date),
    newBuild: t.newBuild,
  }));

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Need at least 2 transactions to display chart.
      </div>
    );
  }

  const minPrice = Math.min(...data.map(d => d.price));
  const maxPrice = Math.max(...data.map(d => d.price));
  const pad = (maxPrice - minPrice) * 0.15 || 50_000;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tickFormatter={d => new Date(d + 'T00:00:00').getFullYear().toString()}
          tick={{ fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          domain={[minPrice - pad, maxPrice + pad]}
          tickFormatter={v => `£${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} />
        {firstDate && (
          <ReferenceLine x={firstDate} stroke="#006e39" strokeDasharray="4 2" label={{ value: 'First', position: 'insideTopRight', fontSize: 10, fill: '#006e39' }} />
        )}
        {lastDate && lastDate !== firstDate && (
          <ReferenceLine x={lastDate} stroke="#dc2626" strokeDasharray="4 2" label={{ value: 'Last', position: 'insideTopRight', fontSize: 10, fill: '#dc2626' }} />
        )}
        <Line
          type="monotone"
          dataKey="price"
          stroke="#006e39"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 7, fill: '#003a21' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
