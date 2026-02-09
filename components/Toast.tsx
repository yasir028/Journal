
import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const bgColors = {
    success: 'bg-surface border-success/30 text-text',
    error: 'bg-surface border-danger/30 text-text',
    info: 'bg-surface border-primary/30 text-text'
  };

  const icons = {
    success: <CheckCircle size={18} className="text-success" />,
    error: <AlertCircle size={18} className="text-danger" />,
    info: <Info size={18} className="text-primary" />
  };

  return (
    <div className={`pointer-events-auto min-w-[300px] max-w-sm p-4 rounded-xl border shadow-lg flex items-start gap-3 animate-in slide-in-from-right-10 fade-in duration-300 ${bgColors[toast.type]}`}>
      <div className="mt-0.5 shrink-0">{icons[toast.type]}</div>
      <div className="flex-1 text-sm font-medium">{toast.message}</div>
      <button onClick={() => onDismiss(toast.id)} className="text-textMuted hover:text-text shrink-0">
        <X size={16} />
      </button>
    </div>
  );
};

export default ToastContainer;
