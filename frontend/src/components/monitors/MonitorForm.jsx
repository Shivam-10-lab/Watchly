import { useState } from 'react';
import { Globe, Clock, AlertCircle } from 'lucide-react';

const INTERVALS = [
  { value: 30,   label: '30 seconds' },
  { value: 60,   label: '1 minute'   },
  { value: 120,  label: '2 minutes'  },
  { value: 300,  label: '5 minutes'  },
  { value: 600,  label: '10 minutes' },
  { value: 1800, label: '30 minutes' },
];

const TYPES = [
  { value: 'http',    label: 'HTTP — checks status code' },
  { value: 'keyword', label: 'Keyword — checks response body' },
  { value: 'ssl',     label: 'SSL — checks certificate' },
];

export default function MonitorForm({ initial = {}, onSubmit, loading }) {
  const [form, setForm] = useState({
    name:               initial.name             || '',
    url:                initial.url              || 'https://',
    intervalSeconds:    initial.intervalSeconds  || 60,
    type:               initial.type             || 'http',
    method:             initial.method           || 'GET',
    expectedStatusCode: initial.expectedStatusCode || 200,
    keywordToFind:      initial.keywordToFind    || '',
    degradedThresholdMs:initial.degradedThresholdMs || 2000,
    webhookEnabled:     initial.notifications?.webhook?.enabled || false,
    webhookUrl:         initial.notifications?.webhook?.url     || '',
    emailRecipients:    (initial.notifications?.email?.recipients || []).join(', '),
  });

  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(p => ({ ...p, [k]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    try { new URL(form.url); }
    catch { e.url = 'Enter a valid URL including https://'; }
    if (!form.url.startsWith('http')) e.url = 'URL must start with https:// or http://';
    if (form.type === 'keyword' && !form.keywordToFind) e.keywordToFind = 'Keyword is required';
    if (form.webhookEnabled && !form.webhookUrl) e.webhookUrl = 'Webhook URL is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      name:               form.name,
      url:                form.url,
      intervalSeconds:    form.intervalSeconds,
      type:               form.type,
      method:             form.method,
      expectedStatusCode: Number(form.expectedStatusCode),
      keywordToFind:      form.keywordToFind,
      degradedThresholdMs:Number(form.degradedThresholdMs),
      notifications: {
        email:   {
          enabled:    true,
          recipients: form.emailRecipients
            .split(',').map(s => s.trim()).filter(Boolean),
        },
        webhook: {
          enabled: form.webhookEnabled,
          url:     form.webhookUrl || null,
        },
      },
    });
  };

  const F = ({ label, err, children }) => (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      {children}
      {err && (
        <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
          <AlertCircle size={11} /> {err}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <F label="Monitor Name" err={errors.name}>
        <input className="input-base" placeholder="My API Service"
          value={form.name} onChange={e => set('name', e.target.value)} />
      </F>

      <F label="URL to Monitor" err={errors.url}>
        <div className="relative">
          <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input-base pl-8" placeholder="https://api.example.com/health"
            value={form.url} onChange={e => set('url', e.target.value)} />
        </div>
      </F>

      <div className="grid grid-cols-2 gap-4">
        <F label="Monitor Type" err={errors.type}>
          <select className="input-base" value={form.type}
            onChange={e => set('type', e.target.value)}
            style={{ colorScheme: 'dark' }}>
            {TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </F>

        <F label="Check Interval">
          <div className="relative">
            <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <select className="input-base pl-8" value={form.intervalSeconds}
              onChange={e => set('intervalSeconds', Number(e.target.value))}
              style={{ colorScheme: 'dark' }}>
              {INTERVALS.map(i => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>
        </F>
      </div>

      {form.type === 'http' && (
        <div className="grid grid-cols-2 gap-4">
          <F label="HTTP Method">
            <select className="input-base" value={form.method}
              onChange={e => set('method', e.target.value)}
              style={{ colorScheme: 'dark' }}>
              {['GET', 'POST', 'HEAD'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </F>
          <F label="Expected Status Code">
            <input type="number" className="input-base" value={form.expectedStatusCode}
              onChange={e => set('expectedStatusCode', e.target.value)} />
          </F>
        </div>
      )}

      {form.type === 'keyword' && (
        <F label="Keyword to Find in Response Body" err={errors.keywordToFind}>
          <input className="input-base" placeholder="All Systems Operational"
            value={form.keywordToFind}
            onChange={e => set('keywordToFind', e.target.value)} />
        </F>
      )}

      <F label="Degraded Response Threshold (ms)">
        <input type="number" className="input-base" value={form.degradedThresholdMs}
          onChange={e => set('degradedThresholdMs', e.target.value)} />
        <p className="text-xs text-gray-600 mt-1">
          Responses slower than this are marked DEGRADED even if status code is correct
        </p>
      </F>

      {/* Notifications */}
      <div className="border border-surface-border rounded-xl p-4 space-y-4">
        <p className="text-sm font-semibold text-white">Notifications</p>

        <F label="Email Recipients (comma-separated)">
          <input className="input-base" placeholder="alice@example.com, bob@example.com"
            value={form.emailRecipients}
            onChange={e => set('emailRecipients', e.target.value)} />
        </F>

        <div className="flex items-center gap-3">
          <input type="checkbox" id="wh-toggle" checked={form.webhookEnabled}
            onChange={e => set('webhookEnabled', e.target.checked)}
            className="w-4 h-4 accent-blue-500" />
          <label htmlFor="wh-toggle" className="text-sm text-gray-300 cursor-pointer">
            Enable webhook notifications (Slack, Discord, custom)
          </label>
        </div>

        {form.webhookEnabled && (
          <F label="Webhook URL" err={errors.webhookUrl}>
            <input className="input-base" placeholder="https://hooks.slack.com/..."
              value={form.webhookUrl}
              onChange={e => set('webhookUrl', e.target.value)} />
            <p className="text-xs text-gray-600 mt-1">
              SSRF protection is enforced — private IP addresses are blocked
            </p>
          </F>
        )}
      </div>

      <button type="submit" disabled={loading}
        className="btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
        {loading ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
        ) : 'Save Monitor'}
      </button>
    </form>
  );
}