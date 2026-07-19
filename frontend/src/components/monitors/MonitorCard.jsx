import { Link }         from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, ChevronRight } from 'lucide-react';
import StatusDot        from './StatusDot';
import Badge            from '../ui/Badge';

export default function MonitorCard({ monitor }) {
  const checked = monitor.lastCheckedAt
    ? formatDistanceToNow(new Date(monitor.lastCheckedAt), { addSuffix: true })
    : 'Never';

  const st = monitor.status?.toLowerCase() || 'pending';

  return (
    <Link to={`/monitors/${monitor._id}`}
      className="block bg-surface-card border border-surface-border rounded-xl p-5 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-200 group animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <StatusDot status={monitor.status} />
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate group-hover:text-blue-300 transition-colors">
              {monitor.name}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <p className="text-xs text-gray-500 truncate max-w-[200px]">{monitor.url}</p>
              <a href={monitor.url} target="_blank" rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-400 transition-colors shrink-0"
                onClick={e => e.stopPropagation()}>
                <ExternalLink size={10} />
              </a>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={st}>{monitor.status}</Badge>
          <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-border">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {monitor.lastResponseTimeMs !== null && (
            <span className={`font-mono font-medium ${
              monitor.lastResponseTimeMs > (monitor.degradedThresholdMs || 2000)
                ? 'text-yellow-400'
                : 'text-gray-400'
            }`}>
              {monitor.lastResponseTimeMs}ms
            </span>
          )}
          <span>Every {monitor.intervalSeconds}s</span>
          <span className="capitalize">{monitor.type}</span>
        </div>
        <span className="text-xs text-gray-600">{checked}</span>
      </div>
    </Link>
  );
}