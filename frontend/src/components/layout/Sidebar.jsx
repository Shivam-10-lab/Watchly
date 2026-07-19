import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, Settings, LogOut,
  Zap, ChevronDown, Plus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const NAV = [
  { to: '/',          label: 'Monitors',  Icon: Activity      },
  { to: '/incidents', label: 'Incidents', Icon: AlertTriangle  },
  { to: '/settings',  label: 'Settings',  Icon: Settings      },
];

export default function Sidebar() {
  const { user, workspaces, currentWorkspace, setCurrentWorkspace, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <aside className="w-60 h-screen bg-surface-card border-r border-surface-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-surface-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="text-base font-bold text-white">Watchly</span>
        </div>
      </div>

      {/* Workspace selector */}
      <div className="px-3 py-3 border-b border-surface-border">
        <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
          onClick={() => {/* workspace switcher dropdown could go here */}}>
          <div className="min-w-0">
            <p className="text-xs text-gray-500 font-medium">WORKSPACE</p>
            <p className="text-sm font-semibold text-white truncate">
              {currentWorkspace?.name || 'No workspace'}
            </p>
          </div>
          <ChevronDown size={14} className="text-gray-500 shrink-0" />
        </div>

        {workspaces.length > 1 && (
          <div className="mt-1 space-y-0.5">
            {workspaces.slice(0, 4).map(ws => (
              <button key={ws._id}
                onClick={() => setCurrentWorkspace(ws)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  currentWorkspace?._id === ws._id
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-surface-raised'
                }`}>
                {ws.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
              ${isActive
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/25'
                : 'text-gray-400 hover:text-white hover:bg-surface-raised'
              }`
            }>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 pb-4 pt-3 border-t border-surface-border">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/8 transition-all">
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}