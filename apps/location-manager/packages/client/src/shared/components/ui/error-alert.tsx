import { AlertCircle } from "lucide-react";
import { Button } from "@client/components/ui/button";

interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorAlert({ title = "Error", message, onRetry }: ErrorAlertProps) {
  return (
    <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-4 flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-destructive">{title}</p>
        <p className="text-sm text-destructive/80 mt-1">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
          Retry
        </Button>
      )}
    </div>
  );
}
