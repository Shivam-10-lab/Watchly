import { useState, useEffect } from 'react';
import { Copy, RefreshCw, Check, Users, Plus, Trash2, Key } from 'lucide-react';
import TopBar  from '../components/layout/TopBar';
import Modal   from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';
import Badge   from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';

export default function Settings() {
  const { currentWorkspace, loadWorkspaces } = useAuth();
  const wsId = currentWorkspace?._id;

  const [apiKey,   setApiKey]   = useState('');
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [copied,   setCopied]   = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole,  setInviteRole]  = useState('viewer');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!wsId) return;
    Promise.all([
      api.get(`/workspaces/${wsId}/api-key`),
      api.get(`/workspaces/${wsId}/members`),
    ]).then(([keyRes, memRes]) => {
      setApiKey(keyRes.data.data.apiKey);
      setMembers(memRes.data.data.members);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [wsId]);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('API key copied');
  };

  const handleRotateKey = async () => {
    if (!confirm('Rotate API key? The current key will stop working immediately.')) return;
    try {
      const { data } = await api.post(`/workspaces/${wsId}/api-key/rotate`);
      setApiKey(data.data.apiKey);
      toast.success('API key rotated');
    } catch { toast.error('Failed to rotate key'); }
  };

  const handleInvite = async () => {
    if (!inviteEmail) return toast.error('Email is required');
    setInviting(true);
    try {
      const { data } = await api.post(`/workspaces/${wsId}/members`, {
        email: inviteEmail,
        role:  inviteRole,
      });
      setMembers(prev => [...prev, data.data.member]);
      setInviteEmail('');
      setShowInvite(false);
      toast.success(`${data.data.user.name} added to workspace`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to invite');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!confirm('Remove this member?')) return;
    try {
      await api.delete(`/workspaces/${wsId}/members/${memberId}`);
      setMembers(prev => prev.filter(m => m.memberId !== memberId && m.user?._id !== memberId));
      toast.success('Member removed');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  if (loading) return (
    <div>
      <TopBar title="Settings" />
      <div className="flex justify-center py-20"><Spinner size="lg" /></div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <TopBar title="Settings" />

      <div className="p-6 max-w-2xl space-y-6">

        {/* Workspace info */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Key size={15} className="text-blue-400" />
            Workspace
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Name</p>
              <p className="text-sm font-medium text-white">{currentWorkspace?.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Status Page URL</p>
              <p className="text-sm font-mono text-blue-400">
                {window.location.origin}/status/{currentWorkspace?.slug}
              </p>
            </div>
          </div>
        </section>

        {/* API Key */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Key size={15} className="text-purple-400" />
            API Key
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Use this key in the <code className="mono text-xs bg-surface-raised px-1 py-0.5 rounded">X-API-Key</code> header for programmatic access. Keep it secret.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-gray-300 truncate">
              {apiKey || '••••••••••••••••••••'}
            </code>
            <button onClick={handleCopyKey}
              className="p-2.5 rounded-lg bg-surface-raised border border-surface-border text-gray-400 hover:text-white transition-colors">
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
            <button onClick={handleRotateKey}
              className="p-2.5 rounded-lg bg-surface-raised border border-surface-border text-gray-400 hover:text-red-400 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </section>

        {/* Team Members */}
        <section className="bg-surface-card border border-surface-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users size={15} className="text-green-400" />
              Team Members ({members.length})
            </h2>
            <button onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/25 hover:bg-blue-600/30 transition-colors">
              <Plus size={12} /> Add Member
            </button>
          </div>

          <div className="space-y-2">
            {members.map(m => (
              <div key={m.memberId || m.user?._id}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-surface-border last:border-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-blue-600/40 flex items-center justify-center text-xs font-bold text-white">
                    {m.user?.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{m.user?.name}</p>
                    <p className="text-xs text-gray-500">{m.user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.role === 'owner' ? 'blue' : 'gray'}>{m.role}</Badge>
                  {m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(m.user?._id)}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/8 transition-all">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showInvite && (
        <Modal title="Add Team Member" onClose={() => setShowInvite(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email Address</label>
              <input type="email" className="input-base" placeholder="colleague@example.com"
                value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Role</label>
              <select className="input-base" value={inviteRole}
                onChange={e => setInviteRole(e.target.value)} style={{ colorScheme: 'dark' }}>
                <option value="viewer">Viewer — read-only dashboard access</option>
                <option value="admin">Admin — can manage monitors and members</option>
              </select>
            </div>
            <button onClick={handleInvite} disabled={inviting}
              className="btn-primary w-full py-3 rounded-xl text-sm font-semibold">
              {inviting ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" /> Adding…
                </span>
              ) : 'Add Member'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}