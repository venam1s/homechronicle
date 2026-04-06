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
      if (visible.length > settings.maxVisible) {
        const toDrop = visible.slice(0, visible.length - settings.maxVisible).map((t) => t.id);
        return next.filter((t) => !toDrop.includes(t.id));
      }
      return next;
    });
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, removing: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 400);
    }, duration);
    return id;
  }, [settings.duration, settings.maxVisible]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, removing: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 400);
  }, []);

  const isTop = settings.position.includes('top');
  const isRight = settings.position.includes('right');
  const isLeft = settings.position.includes('left');
  const isCenter = settings.position.includes('center');

  function colorRgb(type) {
    return type === 'error'
      ? 'var(--hc-toast-error-rgb, 220, 38, 38)'
      : 'var(--hc-accent-rgb)';
  }

  return (
    <ToastContext.Provider value={{ addToast, dismiss, configure }}>
      {children}
      {toasts.length > 0 && (
        <div
          className={clsx(
            'fixed z-[9999] flex flex-col gap-2 px-3 pointer-events-none',
            isTop ? 'top-20 pt-2' : 'bottom-0 pb-2 hc-standalone:pb-24',
            isCenter ? 'left-0 right-0 items-center' : isRight ? 'right-0 items-end' : 'left-0 items-start',
          )}
        >
          {toasts.map((toast) => {
            const rgb = colorRgb(toast.type);
            return (
              <div
                key={toast.id}
                className={clsx(
                  'hc-toast pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-full text-sm font-medium max-w-md w-full sm:w-auto',
                  'shadow-md backdrop-blur-sm border transition-all duration-400 ease-out',
                  toast.removing
                    ? 'opacity-0 scale-95'
                    : isTop ? 'opacity-100 scale-100 animate-toast-in-top' : 'opacity-100 scale-100 animate-toast-in-bottom',
                )}
                style={{
                  background: `rgba(${rgb}, 0.1)`,
                  borderColor: `rgba(${rgb}, 0.25)`,
                }}
              >
                <span
                  className="flex items-center justify-center h-5 w-5 rounded-full flex-shrink-0"
                  style={{ background: `rgba(${rgb}, 0.2)` }}
                >
                  {toast.type === 'success' && <CheckCircle2 size={13} style={{ color: `rgb(${rgb})` }} />}
                  {toast.type === 'error' && <AlertCircle size={13} style={{ color: `rgb(${rgb})` }} />}
                  {toast.type === 'info' && <Info size={13} style={{ color: `rgb(${rgb})` }} />}
                </span>
                <span
                  className="flex-1 text-sm"
                  style={{ color: toast.type === 'error' ? `rgb(${rgb})` : 'var(--hc-fg)' }}
                >
                  {toast.message}
                </span>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="flex items-center justify-center h-5 w-5 rounded-full transition-colors flex-shrink-0 hover:opacity-70"
                  style={{
                    background: `rgba(${rgb}, 0.15)`,
                    color: toast.type === 'error' ? `rgb(${rgb})` : 'var(--hc-muted)',
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}
