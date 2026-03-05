import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Dot,
} from 'recharts';
import { Transaction } from '../types';
import { formatGBP, formatDate } from '../utils/format';

interface Props {
  transactions: Transaction[];
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: Transaction;
}

function CustomDot({ cx = 0, cy = 0, payload }: CustomDotProps) {
  const fill = payload?.newBuild ? '#2563eb' : '#006e39';
  const r = payload?.newBuild ? 7 : 5;
  return <Dot cx={cx} cy={cy} r={r} fill={fill} stroke="white" strokeWidth={1.5} />;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Transaction & { price: number } }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded shadow-md p-2 text-xs">
      <p className="font-semibold">{formatGBP(d.price)}</p>
      <p className="text-gray-500">{formatDate(d.date)}</p>
      {d.newBuild && <p className="text-blue-600">New build</p>}
    </div>
  );
}

export default function TransactionChart({ transactions }: Props) {
  if (transactions.length < 2) return null;

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const prices = sorted.map(t => t.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const pad = Math.max((maxP - minP) * 0.15, 25000);

  const firstDate = sorted[0].date;
  const lastDate = sorted[sorted.length - 1].date;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={sorted} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tickFormatter={v => new Date(v + 'T12:00:00Z').getFullYear().toString()}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          domain={[minP - pad, maxP + pad]}
          tickFormatter={v => `£${Math.round(v / 1000)}k`}
          tick={{ fontSize: 11 }}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine x={firstDate} stroke="#006e39" strokeDasharray="4 2" strokeWidth={1.5} />
        <ReferenceLine x={lastDate} stroke="#dc2626" strokeDasharray="4 2" strokeWidth={1.5} />
        <Line
          type="monotone"
          dataKey="price"
          stroke="#006e39"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 8 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
