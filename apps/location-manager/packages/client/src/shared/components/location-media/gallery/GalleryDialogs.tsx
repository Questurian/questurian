import { Input } from "@client/components/ui/input";
import { Button } from "@client/components/ui";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@client/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@client/components/ui/dialog";
import type { EditCreditState } from "./useLocationMediaGallery";

interface GalleryDialogsProps {
  deleteType?: "upload" | "instagram";
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  editCreditState: EditCreditState;
  onChangeCredit: (value: string) => void;
  onCancelCredit: () => void;
  onSaveCredit: () => void;
  isSavingCredit: boolean;
}

export function GalleryDialogs(props: GalleryDialogsProps) {
  return (
    <>
      <AlertDialog open={Boolean(props.deleteType)} onOpenChange={(open) => { if (!open) props.onCancelDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {props.deleteType === "instagram" ? "Instagram embed" : "upload"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The {props.deleteType === "instagram" ? "Instagram embed" : "uploaded image set"} will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={props.onConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={props.editCreditState !== null} onOpenChange={(open) => { if (!open) props.onCancelCredit(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Photographer Credit</DialogTitle>
            <DialogDescription>Photographer credit is required for all uploaded image sets.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input value={props.editCreditState?.value || ""} onChange={(event) => props.onChangeCredit(event.target.value)} placeholder="Name, studio, or publication" autoFocus />
            {props.editCreditState?.error && <p className="text-xs text-destructive">{props.editCreditState.error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCancelCredit} disabled={props.isSavingCredit}>Cancel</Button>
            <Button type="button" onClick={props.onSaveCredit} disabled={props.isSavingCredit}>{props.isSavingCredit ? "Saving..." : "Save Credit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
