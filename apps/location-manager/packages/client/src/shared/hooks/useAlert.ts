import { useContext } from "react";
import { AlertContext } from "@client/shared/providers/AlertProvider";

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within AlertProvider");
  }
  return context;
}
