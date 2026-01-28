import { createContext, useCallback, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@client/components/ui";

type AlertType = "confirm" | "alert" | "error" | "success";

interface AlertConfig {
  type: AlertType;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  variant?: "default" | "destructive";
}

interface AlertContextValue {
  showConfirm: (config: Omit<AlertConfig, "type">) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
}

export const AlertContext = createContext<AlertContextValue | null>(null);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    isOpen: boolean;
    config: AlertConfig | null;
  }>({
    isOpen: false,
    config: null,
  });

  const showAlert = useCallback((config: AlertConfig) => {
    setState({ isOpen: true, config });
  }, []);

  const showConfirm = useCallback((config: Omit<AlertConfig, "type">) => {
    showAlert({ ...config, type: "confirm" });
  }, [showAlert]);

  const showSuccess = useCallback((message: string, title = "Success") => {
    showAlert({
      type: "success",
      title,
      message,
      confirmText: "OK",
    });
  }, [showAlert]);

  const showError = useCallback((message: string, title = "Error") => {
    showAlert({
      type: "error",
      title,
      message,
      confirmText: "OK",
      variant: "destructive",
    });
  }, [showAlert]);

  const closeAlert = useCallback(() => {
    setState({ isOpen: false, config: null });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (state.config?.onConfirm) {
      await state.config.onConfirm();
    }
    closeAlert();
  }, [state.config, closeAlert]);

  const handleCancel = useCallback(() => {
    if (state.config?.onCancel) {
      state.config.onCancel();
    }
    closeAlert();
  }, [state.config, closeAlert]);

  return (
    <AlertContext.Provider value={{ showConfirm, showSuccess, showError }}>
      {children}

      <AlertDialog open={state.isOpen} onOpenChange={(open) => !open && closeAlert()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.config?.title}</AlertDialogTitle>
            {state.config?.message && (
              <AlertDialogDescription>{state.config.message}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {state.config?.type === "confirm" && (
              <AlertDialogCancel onClick={handleCancel}>
                {state.config.cancelText || "Cancel"}
              </AlertDialogCancel>
            )}
            <AlertDialogAction
              onClick={handleConfirm}
              className={state.config?.variant === "destructive" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {state.config?.confirmText || "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AlertContext.Provider>
  );
}
