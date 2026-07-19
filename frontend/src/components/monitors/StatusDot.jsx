export default function StatusDot({ status, animate = true }) {
  const s = status?.toLowerCase() || 'pending';
  return (
    <span className={`status-dot ${s} ${s === 'down' && animate ? 'animate-pulse' : ''}`} />
  );
}