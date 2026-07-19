import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login         from './pages/Login';
import Register      from './pages/Register';
import Dashboard     from './pages/Dashboard';
import MonitorDetail from './pages/MonitorDetail';
import Incidents     from './pages/Incidents';
import Settings      from './pages/Settings';
import StatusPage    from './pages/StatusPage';
import AppShell      from './components/layout/AppShell';
import Spinner       from './components/ui/Spinner';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/status/:slug" element={<StatusPage />} />

      {/* Protected — wrapped in AppShell (sidebar + topbar) */}
      <Route path="/" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }>
        <Route index                   element={<Dashboard />} />
        <Route path="monitors/:id"     element={<MonitorDetail />} />
        <Route path="incidents"        element={<Incidents />} />
        <Route path="settings"         element={<Settings />} />
      </Route>
    </Routes>
  );
}