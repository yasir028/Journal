import React from 'react';

type TagVariant = 'win' | 'loss' | 'long' | 'short' | 'open' | 'neutral' | 'warning' | 'mes' | 'mnq' | string;

interface StatusTagProps {
  variant: TagVariant;
  label?: string;
  className?: string;
}

const variantStyles: Record<string, string> = {
  win:     'border-green-500 bg-green-950 text-green-400',
  loss:    'border-red-600   bg-red-950   text-red-400',
  long:    'border-blue-500  bg-blue-950  text-blue-400',
  short:   'border-amber-500 bg-amber-950 text-amber-400',
  open:    'border-purple-500 bg-purple-950 text-purple-400',
  warning: 'border-amber-500 bg-amber-950 text-amber-400',
  mes:     'border-blue-500  bg-blue-950  text-blue-300',
  mnq:     'border-amber-500 bg-amber-950 text-amber-300',
  neutral: 'border-gray-500  bg-gray-900  text-gray-400',
};

const StatusTag: React.FC<StatusTagProps> = ({ variant, label, className = '' }) => {
  const styles = variantStyles[variant] ?? variantStyles.neutral;
  const displayLabel = label ?? variant.charAt(0).toUpperCase() + variant.slice(1);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-none font-mono tracking-wide ${styles} ${className}`}
    >
      {displayLabel}
    </span>
  );
};

export default StatusTag;
