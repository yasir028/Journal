import React from 'react';

type CalloutIntent = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

interface CalloutProps {
  intent?: CalloutIntent;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const intentStyles: Record<CalloutIntent, { border: string; title: string; bg: string }> = {
  info:    { border: 'border-l-blue-500',   title: 'text-blue-400',   bg: 'bg-blue-950/30' },
  success: { border: 'border-l-green-500',  title: 'text-green-400',  bg: 'bg-green-950/30' },
  warning: { border: 'border-l-amber-500',  title: 'text-amber-400',  bg: 'bg-amber-950/30' },
  danger:  { border: 'border-l-red-500',    title: 'text-red-400',    bg: 'bg-red-950/30' },
  neutral: { border: 'border-l-gray-500',   title: 'text-gray-400',   bg: 'bg-gray-900/30' },
};

const Callout: React.FC<CalloutProps> = ({ intent = 'info', title, children, className = '' }) => {
  const s = intentStyles[intent];
  return (
    <div className={`border-l-4 ${s.border} ${s.bg} pl-3 pr-3 py-2.5 rounded-r-sm ${className}`}>
      {title && (
        <p className={`text-xs font-semibold uppercase tracking-widest font-mono mb-1 ${s.title}`}>
          {title}
        </p>
      )}
      <div className="text-sm text-textMuted leading-relaxed">{children}</div>
    </div>
  );
};

export default Callout;
