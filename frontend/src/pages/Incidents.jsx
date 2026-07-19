import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { AlertTriangle, CheckCircle, Clock, ChevronDown } from 'lucide-react';
import TopBar    from '../components/layout/TopBar';
import Badge     from '../components/ui/Badge';
import Spinner   from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import socket from '../api/socket';

const formatDuration = (s) => {
  if (!s) return 'Ongoing';
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export default function Incidents() {
  const { currentWorkspace } = useAuth();
  const wsId = currentWorkspace?._id;

  const [incidents,  setIncidents]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('all');
  const [cursor,     setCursor]     = useState(null);
  const [hasNext,    setHasNext]    = useState(false);
  const [loadingMore,setLoadingMore]= useState(false);

  const load = useCallback(async (nextCursor = null, append = false) => {
    if (!wsId) return;
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = { limit: 20 };
      if (filter !== 'all') params.status = filter;
      if (nextCursor) params.cursor = nextCursor;

      const { data } = await api.get(`/workspaces/${wsId}/incidents`, { params });
      const items = data.data.incidents;

      setIncidents(prev => append ? [...prev, ...items] : items);
      setCursor(data.data.nextCursor);
      setHasNext(data.data.hasNextPage);
    } catch { toast.error('Failed to load incidents'); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [wsId, filter]);

  useEffect(() => { setCursor(null); load(null, false); }, [load]);

  // Live updates
  useEffect(() => {
    socket.on('incident:opened', (event) => {
      setIncidents(prev => [{
        _id:         event.incidentId,
        monitorId:   { _id: event.monitorId, name: event.monitorName },
        status:      'ongoing',
        startedAt:   event.startedAt,
        acknowledged:false,
      }, ...prev]);
    });
    socket.on('incident:resolved', (event) => {
      setIncidents(prev => prev.map(i =>
        i._id === event.incidentId
          ? { ...i, status: 'resolved', resolvedAt: event.resolvedAt }
          : i
      ));
    });
    return () => {
      socket.off('incident:opened');
      socket.off('incident:resolved');
    };
  }, []);

  const handleAcknowledge = async (incidentId) => {
    try {
      await api.post(`/workspaces/${wsId}/incidents/${incidentId}/acknowledge`);
      setIncidents(prev => prev.map(i =>
        i._id === incidentId ? { ...i, acknowledged: true } : i
      ));
      toast.success('Incident acknowledged');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="animate-fade-in">
      <TopBar title="Incidents" />

      <div className="p-6 space-y-5">
        {/* Filter tabs */}
        <div className="flex gap-2">
          {['all', 'ongoing', 'resolved'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-all ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-card border border-surface-border text-gray-400 hover:text-white'
              }`}>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : incidents.length === 0 ? (
          <EmptyState
            icon="✅"
            title="No incidents found"
            description={filter === 'ongoing'
              ? "All your monitors are healthy right now."
              : "No incidents match the current filter."}
          />
        ) : (
          <div className="space-y-3">
            {incidents.map(incident => (
              <div key={incident._id}
                className="bg-surface-card border border-surface-border rounded-xl p-5 hover:border-white/12 transition-all animate-slide-up">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant={incident.status}>{incident.status}</Badge>
                      {incident.acknowledged && (
                        <Badge variant="blue">Acknowledged</Badge>
                      )}
                      <span className="text-xs text-gray-600 font-mono">
                        {incident._id?.slice(-8)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-white mb-1">
                      {incident.monitorId?.name || 'Unknown Monitor'}
                    </p>

                    {incident.triggerErrorMessage && (
                      <p className="text-xs text-red-400/80 font-mono mb-2 truncate">
                        {incident.triggerErrorMessage}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <AlertTriangle size={11} />
                        {format(new Date(incident.startedAt), 'MMM d, HH:mm:ss')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {incident.status === 'resolved'
                          ? formatDuration(incident.durationSeconds)
                          : `${formatDistanceToNow(new Date(incident.startedAt))} ago`}
                      </span>
                    </div>
                  </div>

                  {incident.status === 'ongoing' && !incident.acknowledged && (
                    <button
                      onClick={() => handleAcknowledge(incident._id)}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 hover:bg-yellow-500/25 transition-colors">
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            ))}

            {hasNext && (
              <div className="flex justify-center pt-2">
                <button onClick={() => load(cursor, true)} disabled={loadingMore}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white bg-surface-card border border-surface-border hover:border-white/20 transition-all disabled:opacity-50">
                  {loadingMore ? <Spinner size="sm" /> : <ChevronDown size={15} />}
                  {loadingMore ? 'Loading…' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}