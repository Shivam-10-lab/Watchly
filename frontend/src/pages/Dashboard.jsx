import { useState, useEffect } from 'react';
import { Activity, AlertTriangle, CheckCircle, Loader2, Plus, TrendingUp } from 'lucide-react';
import MonitorCard    from '../components/monitors/MonitorCard';
import TopBar         from '../components/layout/TopBar';
import Modal          from '../components/ui/Modal';
import MonitorForm    from '../components/monitors/MonitorForm';
import EmptyState     from '../components/ui/EmptyState';
import Spinner        from '../components/ui/Spinner';
import useMonitors    from '../hooks/useMonitors';
import { useAuth }    from '../context/AuthContext';
import api            from '../api/axios';
import toast          from 'react-hot-toast';
import socket         from '../api/socket';

const StatCard = ({ icon: Icon, label, value, color, sub }) => (
  <div className="bg-surface-card border border-surface-border rounded-xl p-5">
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={15} className="text-white" />
      </div>
    </div>
    <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
    {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
  </div>
);

export default function Dashboard() {
  const { currentWorkspace } = useAuth();
  const { monitors, loading, refetch } = useMonitors(currentWorkspace?._id);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating]   = useState(false);
  const [summary, setSummary]     = useState(null);

  // Fetch summary counts
  useEffect(() => {
    if (!currentWorkspace) return;
    api.get(`/workspaces/${currentWorkspace._id}/monitors/summary`)
      .then(r => setSummary(r.data.data.summary))
      .catch(() => {});
  }, [currentWorkspace, monitors]);

  // Live incident counter via WebSocket
  const [activeIncidents, setActiveIncidents] = useState(0);
  useEffect(() => {
    if (!currentWorkspace) return;
    api.get(`/workspaces/${currentWorkspace._id}/incidents/active`)
      .then(r => setActiveIncidents(r.data.count))
      .catch(() => {});
  }, [currentWorkspace]);

  useEffect(() => {
    socket.on('incident:opened',   () => setActiveIncidents(n => n + 1));
    socket.on('incident:resolved', () => setActiveIncidents(n => Math.max(0, n - 1)));
    return () => {
      socket.off('incident:opened');
      socket.off('incident:resolved');
    };
  }, []);

  const handleCreate = async (formData) => {
    setCreating(true);
    try {
      await api.post(`/workspaces/${currentWorkspace._id}/monitors`, formData);
      toast.success('Monitor created! First check running now.');
      setShowModal(false);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create monitor');
    } finally {
      setCreating(false);
    }
  };

  const upCount      = monitors.filter(m => m.status === 'UP').length;
  const downCount    = monitors.filter(m => m.status === 'DOWN').length;
  const allOperational = downCount === 0 && monitors.length > 0;

  return (
    <div className="animate-fade-in">
      <TopBar title="Monitors" onAddMonitor={() => setShowModal(true)} />

      <div className="p-6 space-y-6">
        {/* Overall status banner */}
        {monitors.length > 0 && (
          <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${
            allOperational
              ? 'bg-green-500/8 border-green-500/20'
              : 'bg-red-500/8 border-red-500/20'
          }`}>
            {allOperational
              ? <CheckCircle size={18} className="text-green-400 shrink-0" />
              : <AlertTriangle size={18} className="text-red-400 shrink-0" />}
            <div>
              <p className={`text-sm font-semibold ${allOperational ? 'text-green-300' : 'text-red-300'}`}>
                {allOperational ? 'All systems operational' : `${downCount} monitor${downCount > 1 ? 's' : ''} down`}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {monitors.length} monitors • {activeIncidents} active incident{activeIncidents !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}

        {/* Stats row */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Activity}      label="Total"     value={summary.total}     color="bg-blue-600" />
            <StatCard icon={CheckCircle}   label="Up"        value={summary.up}        color="bg-green-600" />
            <StatCard icon={AlertTriangle} label="Down"      value={summary.down}      color="bg-red-600" />
            <StatCard icon={TrendingUp}    label="Health"    value={`${summary.healthScore}%`} color="bg-purple-600" />
          </div>
        )}

        {/* Monitors grid */}
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : monitors.length === 0 ? (
          <EmptyState
            icon="📡"
            title="No monitors yet"
            description="Create your first monitor to start tracking uptime and response times."
            action={
              <button onClick={() => setShowModal(true)}
                className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
                <Plus size={15} /> Add Your First Monitor
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {monitors.map(m => <MonitorCard key={m._id} monitor={m} />)}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Add Monitor" subtitle="Configure a new health check" onClose={() => setShowModal(false)} size="lg">
          <MonitorForm onSubmit={handleCreate} loading={creating} />
        </Modal>
      )}
    </div>
  );
}