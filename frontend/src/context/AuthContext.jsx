import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setAccessToken } from '../api/axios';
import socket from '../api/socket';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user,            setUser]            = useState(null);
  const [currentWorkspace,setCurrentWorkspace]= useState(null);
  const [workspaces,      setWorkspaces]      = useState([]);
  const [loading,         setLoading]         = useState(true);

  // ── Restore session on page load ─────────────────────────────────────────
  useEffect(() => {
    const restore = async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.data.accessToken);
        setUser(data.data.user);
        await loadWorkspaces();
      } catch {
        // No valid refresh token — user is logged out
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const loadWorkspaces = useCallback(async () => {
    try {
      const { data } = await api.get('/workspaces');
      setWorkspaces(data.data.workspaces || []);
      if (data.data.workspaces?.length > 0 && !currentWorkspace) {
        setCurrentWorkspace(data.data.workspaces[0]);
      }
    } catch { /* silent */ }
  }, [currentWorkspace]);

  // ── Connect socket when workspace changes ────────────────────────────────
  useEffect(() => {
    if (!currentWorkspace) return;

    if (!socket.connected) socket.connect();

    socket.emit('join:workspace', currentWorkspace._id);

    socket.on('joined:workspace', ({ workspaceId }) => {
      console.log(`🔌 Joined workspace room: ${workspaceId}`);
    });

    return () => {
      socket.off('joined:workspace');
    };
  }, [currentWorkspace]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
    await loadWorkspaces();
    return data.data.user;
  }, [loadWorkspaces]);

  const register = useCallback(async (name, email, password) => {
    await api.post('/auth/register', { name, email, password });
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /**/ }
    setAccessToken(null);
    setUser(null);
    setCurrentWorkspace(null);
    setWorkspaces([]);
    socket.disconnect();
  }, []);

  return (
    <AuthCtx.Provider value={{
      user, loading,
      workspaces, currentWorkspace, setCurrentWorkspace,
      loadWorkspaces,
      login, register, logout,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}