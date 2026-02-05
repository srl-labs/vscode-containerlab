/**
 * Toast Component - Simple notification toast
 */
import React, { useState, useCallback } from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

export interface ToastMessage {
  id: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => (
  <>
    {toasts.map((toast, index) => (
      <Snackbar
        key={toast.id}
        open
        autoHideDuration={toast.duration ?? 3000}
        onClose={() => onDismiss(toast.id)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ bottom: `${24 + index * 60}px !important` }}
      >
        <Alert onClose={() => onDismiss(toast.id)} severity={toast.type ?? "info"} variant="standard">
          {toast.message}
        </Alert>
      </Snackbar>
    ))}
  </>
);

// Counter for generating unique toast IDs
let toastIdCounter = 0;

/**
 * Hook for managing toast notifications
 */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastMessage["type"] = "info", duration?: number) => {
      const id = `toast-${Date.now()}-${++toastIdCounter}`;
      setToasts((prev) => [...prev, { id, message, type, duration }]);
      return id;
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    toasts,
    addToast,
    dismissToast
  };
}
