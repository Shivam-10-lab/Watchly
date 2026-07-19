import { useState, useEffect } from 'react';
import { useParams }           from 'react-router-dom';
import { format }              from 'date-fns';
import { CheckCircle, AlertTriangle, Minus, Zap } from 'lucide-react';
import api from '../api/axios';

const StatusIcon = ({ status }) => {
  if (status === 'UP')       return <CheckCircle size={16} className="text-green-400" />;
  if (status === 'DOWN')     return <AlertTriangle size={16} className="text-red-400" />;
  if (status === 'DEGRADED') return <AlertTriangle size={16} className="text-yellow-400" />;
  return <Minus size={16} className="text-gray-500" />;
};

const OVERALL_CFG = {
  operational: { label: 'All Systems Operational', color: 'bg-green-500/15 border-green-500/30 text-green-300' },
  degraded:    { label: 'Partial Service Disruption', color: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300' },
  outage:      { label: 'Service Outage',            color: 'bg-red-500/15 border-red-500/30 text-red-300' },
};

export default function StatusPage() {
  const { slug }        = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    api.get(`/status/${slug}`)
      .then(r => setData(r.data.data))
      .catch(() => setError('Status page not found'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-surface text-center px-4">
      <div>
        <p className="text-5xl mb-4">🔍</p>
        <h1 className="text-xl font-bold text-white mb-2">Status Page Not Found</h1>
        <p className="text-gray-500 text-sm">Check the URL and try again.</p>
      </div>
    </div>
  );

  const overall = OVERALL_CFG[data.overallStatus] || OVERALL_CFG.operational;

  return (
    <div className="min-h-screen bg-surface text-gray-200">
      <div className="max-w-2xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">{data.workspace.name}</h1>
          </div>
          {data.workspace.statusPageMessage && (
            <p className="text-gray-400 text-sm">{data.workspace.statusPageMessage}</p>
          )}
        </div>

        {/* Overall status */}
        <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border mb-8 ${overall.color}`}>
          {data.overallStatus === 'operational'
            ? <CheckCircle size={20} />
            : <AlertTriangle size={20} />}
          <p className="font-semibold">{overall.label}</p>
        </div>

        {/* Active incidents */}
        {data.activeIncidents?.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-white mb-3 uppercase tracking-wide">Active Incidents</h2>
            {data.activeIncidents.map(inc => (
              <div key={inc._id}
                className="bg-red-500/8 border border-red-500/20 rounded-xl p-4 mb-3">
                <p className="text-sm font-medium text-red-300">{inc.monitorName} — Service Disruption</p>
                <p className="text-xs text-gray-500 mt-1">
                  Since {format(new Date(inc.startedAt), 'MMM d, HH:mm')} UTC
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Monitor list */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-3 uppercase tracking-wide">Services</h2>
          <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden">
            {data.monitors.map((m, i) => (
              <div key={m._id}
                className={`flex items-center justify-between px-5 py-4 ${
                  i < data.monitors.length - 1 ? 'border-b border-surface-border' : ''
                }`}>
                <div className="flex items-center gap-3">
                  <StatusIcon status={m.status} />
                  <div>
                    <p className="text-sm font-medium text-white">{m.name}</p>
                    {m.uptimePercent90d && (
                      <p className="text-xs text-gray-500 mt-0.5">{m.uptimePercent90d}% uptime (90d)</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {m.lastResponseTimeMs && (
                    <span className="text-xs text-gray-500 font-mono">{m.lastResponseTimeMs}ms</span>
                  )}
                  <span className={`text-xs font-semibold ${
                    m.status === 'UP'       ? 'text-green-400' :
                    m.status === 'DOWN'     ? 'text-red-400'   :
                    m.status === 'DEGRADED' ? 'text-yellow-400': 'text-gray-500'
                  }`}>{m.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 mt-10">
          Last updated {format(new Date(data.generatedAt), 'MMM d, yyyy HH:mm')} UTC
          <br />
          Powered by <span className="text-blue-500">Watchly</span>
        </p>
      </div>
    </div>
  );
}