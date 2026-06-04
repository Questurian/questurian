import { Button } from "@client/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@client/components/ui/alert-dialog";

interface PayloadSyncHeaderProps {
  handleSyncAll: () => void;
  isBulkSyncing: boolean;
  isResettingSyncState: boolean;
  resetAllSyncState: () => Promise<unknown>;
  showToast: (message: string, position: { x: number; y: number }) => void;
  syncAllButtonLabel: string;
  syncableFilteredCount: number;
}

export function PayloadSyncHeader({
  handleSyncAll,
  isBulkSyncing,
  isResettingSyncState,
  resetAllSyncState,
  showToast,
  syncAllButtonLabel,
  syncableFilteredCount,
}: PayloadSyncHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h2 className="text-[24px] font-bold mb-2 text-foreground">Payload CMS Sync</h2>
        <p className="text-muted-foreground">Sync location data from url-util to Payload CMS</p>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncAll}
          disabled={isBulkSyncing || syncableFilteredCount === 0}
        >
          {syncAllButtonLabel}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">Reset Sync State</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all sync state?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="font-semibold text-destructive">Only use this after wiping the Payload CMS database.</p>
                  <p>This deletes all stored Payload document IDs and clears all location references locally. On next sync, every location will be created as a new document in Payload.</p>
                  <p>If synced documents still exist in Payload, this will create duplicates - there is no undo.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await resetAllSyncState();
                  showToast("Sync state reset successfully", { x: window.innerWidth / 2, y: 100 });
                }}
                disabled={isResettingSyncState}
              >
                {isResettingSyncState ? "Resetting..." : "Yes, reset sync state"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
