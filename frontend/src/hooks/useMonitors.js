import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import socket from '../api/socket';

export default function useMonitors(workspaceId) {
  const [monitors, setMonitors] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const fetchMonitors = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/workspaces/${workspaceId}/monitors`);
      setMonitors(data.data.monitors || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchMonitors(); }, [fetchMonitors]);

  // ── Real-time status updates via WebSocket ──────────────────────────────
  // This is the moment debouncing / throttling in the system pays off:
  // without it, a monitor flapping UP/DOWN rapidly would re-render the
  // entire dashboard many times per second.
  useEffect(() => {
    const handleStatusChange = (event) => {
      setMonitors(prev =>
        prev.map(m =>
          m._id === event.monitorId
            ? { ...m, status: event.newStatus, lastCheckedAt: event.timestamp }
            : m
        )
      );
    };

    const handleCheckCompleted = (event) => {
      setMonitors(prev =>
        prev.map(m =>
          m._id === event.monitorId
            ? { ...m, lastResponseTimeMs: event.responseTimeMs, lastCheckedAt: event.checkedAt }
            : m
        )
      );
    };

    socket.on('monitor:status_changed',  handleStatusChange);
    socket.on('monitor:check_completed', handleCheckCompleted);

    return () => {
      socket.off('monitor:status_changed',  handleStatusChange);
      socket.off('monitor:check_completed', handleCheckCompleted);
    };
  }, []);

  return { monitors, loading, error, refetch: fetchMonitors };
}