import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { format } from 'date-fns';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs">
      <p className="text-gray-400 mb-1">{format(new Date(d.time), 'MMM d, HH:mm:ss')}</p>
      <p className="text-white font-semibold">{d.responseTimeMs}ms</p>
      <p className={`capitalize font-medium ${
        d.status === 'UP' ? 'text-green-400' :
        d.status === 'DOWN' ? 'text-red-400' : 'text-yellow-400'
      }`}>{d.status}</p>
    </div>
  );
};

export default function ResponseTimeChart({ data = [] }) {
  if (!data.length) return (
    <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
      No response time data yet
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="time"
          tickFormatter={v => format(new Date(v), 'HH:mm')}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false} tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={v => `${v}ms`}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false} tickLine={false} width={50}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone" dataKey="responseTimeMs"
          stroke="#3b82f6" strokeWidth={2}
          fill="url(#rtGrad)" dot={false}
          activeDot={{ r: 4, fill: '#3b82f6' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}