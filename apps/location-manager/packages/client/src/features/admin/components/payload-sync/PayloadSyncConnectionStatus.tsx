import { Button } from "@client/components/ui/button";
import { RefreshCw } from "lucide-react";

interface PayloadConnectionStatus {
  connected?: boolean;
  error?: string;
}

interface PayloadSyncConnectionStatusProps {
  connectionStatus: PayloadConnectionStatus | undefined;
  isConnecting: boolean;
  testConnection: () => unknown;
}

export function PayloadSyncConnectionStatus({
  connectionStatus,
  isConnecting,
  testConnection,
}: PayloadSyncConnectionStatusProps) {
  if (isConnecting) {
    return (
      <div className="mb-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">Connecting to Payload...</span>
          </div>
        </div>
      </div>
    );
  }

  if (connectionStatus?.connected) {
    return (
      <div className="mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">Connected to Payload CMS</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => testConnection()}
            aria-label="Test Payload connection again"
            title="Test Payload connection again"
            className="h-8 w-8 text-emerald-300 hover:text-emerald-200"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-red-400 font-medium">Not Connected</span>
          <Button variant="outline" size="sm" onClick={() => testConnection()}>
            Retry Connection
          </Button>
        </div>
        {connectionStatus?.error && (
          <p className="text-sm text-red-400 mt-2">{connectionStatus.error}</p>
        )}
      </div>
    </div>
  );
}
