import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Trash2, Pause, Play,
  ExternalLink, RefreshCw, Upload,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import StatusDot          from '../components/monitors/StatusDot';
import Badge              from '../components/ui/Badge';
import UptimeBar          from '../components/monitors/UptimeBar';
import ResponseTimeChart  from '../components/monitors/ResponseTimeChart';
import Modal              from '../components/ui/Modal';
import MonitorForm        from '../components/monitors/MonitorForm';
import Spinner            from '../components/ui/Spinner';
import { useAuth }        from '../context/AuthContext';
import api                from '../api/axios';
import toast              from 'react-hot-toast';
import socket             from '../api/socket';

export default function MonitorDetail() {
  const { id }             = useParams();
  const navigate           = useNavigate();
  const { currentWorkspace } = useAuth();
  const wsId               = currentWorkspace?._id;

  const [monitor,  setMonitor]  = useState(null);
  const [stats,    setStats]    = useState(null);
  const [checks,   setChecks]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [saving,   setSaving]   = useState(false);

  const load = async () => {
    if (!wsId) return;
    try {
      const [monRes, statsRes, checksRes] = await Promise.all([
        api.get(`/workspaces/${wsId}/monitors/${id}`),
        api.get(`/workspaces/${wsId}/stats/monitors/${id}/stats?period=24h`),
        api.get(`/workspaces/${wsId}/stats/monitors/${id}/checks?limit=50`),
      ]);
      setMonitor(monRes.data.data.monitor);
      setStats(statsRes.data.data.stats);
      setChecks(checksRes.data.data.checks);
    } catch { toast.error('Failed to load monitor'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id, wsId]);

  // Real-time response time updates
  useEffect(() => {
    const handler = (event) => {
      if (event.monitorId !== id) return;
      setMonitor(prev => prev ? {
        ...prev,
        status:           event.newStatus || prev.status,
        lastResponseTimeMs: event.responseTimeMs ?? prev.lastResponseTimeMs,
        lastCheckedAt:    event.checkedAt || prev.lastCheckedAt,
      } : prev);
      if (event.responseTimeMs) {
        setChecks(prev => [
          {
            checkedAt:     event.checkedAt,
            status:        event.status,
            responseTimeMs:event.responseTimeMs,
            statusCode:    event.statusCode,
          },
          ...prev.slice(0, 49),
        ]);
      }
    };
    socket.on('monitor:status_changed',  handler);
    socket.on('monitor:check_completed', handler);
    return () => {
      socket.off('monitor:status_changed',  handler);
      socket.off('monitor:check_completed', handler);
    };
  }, [id]);

  const handlePauseResume = async () => {
    try {
      const action = monitor.isPaused ? 'resume' : 'pause';
      await api.post(`/workspaces/${wsId}/monitors/${id}/${action}`);
      toast.success(`Monitor ${action}d`);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete monitor "${monitor.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/workspaces/${wsId}/monitors/${id}`);
      toast.success('Monitor deleted');
      navigate('/');
    } catch { toast.error('Failed to delete'); }
  };

  const handleUpdate = async (formData) => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/workspaces/${wsId}/monitors/${id}`, formData);
      setMonitor(data.data.monitor);
      setShowEdit(false);
      toast.success('Monitor updated');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
  );
  if (!monitor) return (
    <div className="p-8 text-gray-500 text-sm">Monitor not found.</div>
  );

  const chartData = checks
    .filter(c => c.responseTimeMs)
    .slice(0, 50)
    .reverse()
    .map(c => ({ time: c.checkedAt, responseTimeMs: c.responseTimeMs, status: c.status }));

  const uptimeData = stats?.charts?.uptime || [];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-card border-b border-surface-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/')}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-surface-raised transition-all">
              <ArrowLeft size={16} />
            </button>
            <StatusDot status={monitor.status} />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-white truncate">{monitor.name}</h1>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="truncate max-w-xs">{monitor.url}</span>
                <a href={monitor.url} target="_blank" rel="noopener noreferrer"
                  className="hover:text-gray-300 transition-colors">
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={monitor.status?.toLowerCase()}>{monitor.status}</Badge>
            <button onClick={load}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-surface-raised transition-all">
              <RefreshCw size={14} />
            </button>
            <button onClick={handlePauseResume}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-surface-raised transition-all">
              {monitor.isPaused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button onClick={() => setShowEdit(true)}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-surface-raised transition-all">
              <Pencil size={14} />
            </button>
            <button onClick={handleDelete}
              className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/8 transition-all">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Uptime (24h)',   value: stats.uptimePercent != null ? `${stats.uptimePercent}%` : '—' },
              { label: 'Avg Response',   value: stats.avgResponseMs  != null ? `${stats.avgResponseMs}ms` : '—' },
              { label: 'p95 Response',   value: stats.p95ResponseMs  != null ? `${stats.p95ResponseMs}ms` : '—' },
              { label: 'Total Checks',   value: stats.totalChecks ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-card border border-surface-border rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Uptime bar */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">90-day Uptime</h2>
          <UptimeBar data={uptimeData} />
        </div>

        {/* Response time chart */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Response Time
            <span className="text-xs text-gray-500 font-normal ml-2">last {checks.length} checks</span>
          </h2>
          <ResponseTimeChart data={chartData} />
        </div>

        {/* Check history table */}
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border">
            <h2 className="text-sm font-semibold text-white">Check History</h2>
          </div>
          {checks.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No checks yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Status','Response Time','Status Code','Checked'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-500 px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checks.slice(0, 25).map((c, i) => (
                    <tr key={i} className="border-b border-surface-border/50 hover:bg-surface-raised/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <StatusDot status={c.status} animate={false} />
                          <span className={`text-xs font-semibold ${
                            c.status === 'UP' ? 'text-green-400' :
                            c.status === 'DOWN' ? 'text-red-400' : 'text-yellow-400'
                          }`}>{c.status}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs font-mono text-gray-300">
                        {c.responseTimeMs != null ? `${c.responseTimeMs}ms` : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono text-gray-400">
                        {c.statusCode ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {formatDistanceToNow(new Date(c.checkedAt), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <Modal title="Edit Monitor" onClose={() => setShowEdit(false)} size="lg">
          <MonitorForm initial={monitor} onSubmit={handleUpdate} loading={saving} />
        </Modal>
      )}
    </div>
  );
}