import { useState } from 'react';
import { format }   from 'date-fns';

export default function UptimeBar({ data = [], totalBars = 90 }) {
  const [tooltip, setTooltip] = useState(null);

  // Pad data to always show totalBars cells
  const padded = Array.from({ length: totalBars }, (_, i) => {
    return data[i] ?? null;
  });

  const getColor = (cell) => {
    if (!cell) return '#1e2535';
    if (cell.uptimePercent === 100) return '#22c55e';
    if (cell.uptimePercent >= 99)   return '#84cc16';
    if (cell.uptimePercent >= 95)   return '#f59e0b';
    if (cell.uptimePercent > 0)     return '#ef4444';
    return '#ef4444';
  };

  const overallUptime = data.length > 0
    ? (data.reduce((s, d) => s + (d?.uptimePercent ?? 0), 0) / data.length).toFixed(2)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span>90 days ago</span>
        {overallUptime && (
          <span className="font-semibold text-green-400">{overallUptime}% uptime</span>
        )}
        <span>Today</span>
      </div>
      <div className="flex gap-[2px] h-8 items-stretch relative">
        {padded.map((cell, i) => (
          <div
            key={i}
            className="uptime-cell"
            style={{ background: getColor(cell), opacity: cell ? 1 : 0.3 }}
            onMouseEnter={(e) => {
              if (!cell) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltip({
                x: rect.left, y: rect.top,
                uptime: cell.uptimePercent,
                hour:   cell.hour,
              });
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 glass rounded-lg px-3 py-2 text-xs pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y - 50 }}>
          <p className="text-white font-semibold">{tooltip.uptime?.toFixed(1)}% uptime</p>
          {tooltip.hour && (
            <p className="text-gray-400">
              {format(new Date(tooltip.hour), 'MMM d, HH:mm')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}