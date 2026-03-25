import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [settings, setSettings] = useState({
    position: 'bottom-right',
    duration: 3000,
    maxVisible: 3,
  });

  const configure = useCallback((newSettings) => {
    setSettings((prev) => {
      const next = {
        position: newSettings.position ?? prev.position,
        duration: newSettings.duration != null ? newSettings.duration * 1000 : prev.duration,
        maxVisible: newSettings.maxVisible ?? prev.maxVisible,
      };
      // Only update if values actually changed
      if (next.position === prev.position && next.duration === prev.duration && next.maxVisible === prev.maxVisible) {
        return prev;
      }
      return next;
    });
  }, []);

  const addToast = useCallback((message, type = 'success', duration = settings.duration) => {
    const id = ++nextId;
    setToasts((prev) => {
      const next = [...prev, { id, message, type, removing: false }];
      const visible = next.filter((t) => !t.removing);
      // Drop oldest toasts beyond the limit
      if (visible.length > settings.maxVisible) {
        const toDrop = visible.slice(0, visible.length - settings.maxVisible).map((t) => t.id);
        return next.filter((t) => !toDrop.includes(t.id));
      }
      return next;
    });
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, removing: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
    }, duration);
    return id;
  }, [settings.duration, settings.maxVisible]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, removing: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-left': 'top-4 left-4',
  };

  const isLeft = settings.position.includes('left');
  const isBottom = settings.position.includes('bottom');

  return (
    <ToastContext.Provider value={{ addToast, dismiss, configure }}>
      {children}
      <div className={clsx('fixed z-[9999] flex flex-col gap-2 pointer-events-none', positionClasses[settings.position], isBottom && 'hc-standalone:bottom-24')}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex items-center gap-2 px-3.5 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-xs transition-all duration-300',
              toast.removing
                ? isLeft ? 'opacity-0 -translate-x-4' : 'opacity-0 translate-x-4'
                : isLeft ? 'opacity-100 translate-x-0 animate-slide-in-left' : 'opacity-100 translate-x-0 animate-slide-in-right',
              toast.type === 'success' && 'bg-green-600 text-white',
              toast.type === 'error' && 'bg-red-600 text-white',
              toast.type === 'info' && 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800',
            )}
          >
            {toast.type === 'success' && <CheckCircle2 size={16} className="flex-shrink-0" />}
            {toast.type === 'error' && <AlertCircle size={16} className="flex-shrink-0" />}
            {toast.type === 'info' && <Info size={16} className="flex-shrink-0" />}
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              className="p-0.5 rounded hover:bg-white/20 transition-colors flex-shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
