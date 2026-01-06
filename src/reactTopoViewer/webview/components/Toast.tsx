/**
 * Toast Component - Simple notification toast
 */
import React, { useEffect, useState, useCallback } from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const duration = toast.duration ?? 3000;

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, duration - 200);

    const dismissTimer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [toast.id, duration, onDismiss]);

  const typeClass = `toast--${toast.type ?? 'info'}`;
  const exitClass = isExiting ? 'toast--exiting' : '';

  return (
    <div className={`toast ${typeClass} ${exitClass}`} role="alert" data-testid="toast">
      <i className="toast-icon fas fa-info-circle" aria-hidden="true" />
      <span className="toast-message">{toast.message}</span>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" data-testid="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

// Counter for generating unique toast IDs
let toastIdCounter = 0;

/**
 * Hook for managing toast notifications
 */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${++toastIdCounter}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    toasts,
    addToast,
    dismissToast
  };
}
