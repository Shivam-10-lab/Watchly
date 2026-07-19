import { useState, useEffect } from 'react';
import { Plus, Wifi, WifiOff } from 'lucide-react';
import socket from '../../api/socket';

export default function TopBar({ title, onAddMonitor }) {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  return (
    <header className="h-16 bg-surface-card border-b border-surface-border px-6 flex items-center justify-between shrink-0">
      <h1 className="text-lg font-bold text-white">{title}</h1>

      <div className="flex items-center gap-3">
        {/* WebSocket connection indicator */}
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
          connected
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {connected
            ? <><Wifi size={11} /> Live</>
            : <><WifiOff size={11} /> Disconnected</>}
        </div>

        {onAddMonitor && (
          <button onClick={onAddMonitor}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold">
            <Plus size={15} /> Add Monitor
          </button>
        )}
      </div>
    </header>
  );
}