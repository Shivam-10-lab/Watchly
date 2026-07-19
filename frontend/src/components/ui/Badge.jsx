const VARIANTS = {
  up:       'bg-green-500/15 text-green-400 border-green-500/25',
  down:     'bg-red-500/15 text-red-400 border-red-500/25',
  degraded: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  paused:   'bg-gray-500/15 text-gray-400 border-gray-500/25',
  pending:  'bg-purple-500/15 text-purple-400 border-purple-500/25',
  ongoing:  'bg-red-500/15 text-red-400 border-red-500/25',
  resolved: 'bg-green-500/15 text-green-400 border-green-500/25',
  blue:     'bg-blue-500/15 text-blue-400 border-blue-500/25',
  gray:     'bg-gray-500/15 text-gray-400 border-gray-500/25',
};

export default function Badge({ variant = 'gray', children, className = '' }) {
  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold
      border capitalize ${VARIANTS[variant] || VARIANTS.gray} ${className}
    `}>
      {children}
    </span>
  );
}