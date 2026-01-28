import { createContext, useCallback, useState } from "react";
import type { ReactNode } from "react";
import { ToastContainer } from "@client/components/ui";

interface Toast {
  id: string;
  message: string;
  position: { x: number; y: number };
}

interface ToastContextValue {
  showToast: (message: string, position: { x: number; y: number }) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, position: { x: number; y: number }) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { id, message, position };
    setToasts((prev) => [...prev, newToast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}








