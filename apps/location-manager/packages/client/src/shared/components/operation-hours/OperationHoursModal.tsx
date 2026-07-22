import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { OperationHoursEditor } from "./OperationHoursEditor";
import {
  buildOperationHoursJson,
  createClosedDayEntries,
  parseOperationHoursJson,
  type DayEntry,
} from "./operation-hours-utils";

interface OperationHoursModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSave: (json: string) => void;
}

export function OperationHoursModal({
  open,
  onOpenChange,
  value,
  onSave,
}: OperationHoursModalProps) {
  const [dayEntries, setDayEntries] = useState<DayEntry[]>(createClosedDayEntries);

  useEffect(() => {
    if (open) setDayEntries(parseOperationHoursJson(value));
  }, [open, value]);

  const handleSave = () => {
    onSave(buildOperationHoursJson(dayEntries));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Operation hours
          </DialogTitle>
          <DialogDescription>
            Mark location open 24/7 or configure opening hours for each day.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <OperationHoursEditor dayEntries={dayEntries} onChange={setDayEntries} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
