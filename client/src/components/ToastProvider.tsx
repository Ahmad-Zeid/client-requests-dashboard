import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Icon } from './Icon';

type ToastTone = 'error' | 'conflict';

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
};

type ToastContextValue = {
  /**
   * Only failures and conflicts get a toast.
   *
   * There is deliberately no `success` tone. When a status change lands, the row
   * already shows the new status — announcing it again is noise the user has to
   * dismiss. Toasts are reserved for things the interface cannot show on its own.
   */
  notify: (toast: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 7000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        Fixed to a corner and outside the document flow, so a toast arriving never
        moves page content. `aria-live="assertive"` because every toast here is a
        failure the user needs to know about now.
      */}
      <div className="toast-region" role="status" aria-live="assertive" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" data-tone={toast.tone}>
            <span className="toast__icon" aria-hidden="true">
              <Icon name="alert" size={15} />
            </span>
            <div className="toast__body">
              <p className="toast__title">{toast.title}</p>
              {toast.message ? <p className="toast__message">{toast.message}</p> : null}
            </div>
            <button
              type="button"
              className="toast__dismiss"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider.');
  }
  return context;
}
