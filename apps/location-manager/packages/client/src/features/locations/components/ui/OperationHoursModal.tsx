import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@client/components/ui/dialog";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Plus, Trash2, Clock } from "lucide-react";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type DayName = (typeof DAYS)[number];

export interface TimeSlot {
  open: string; // HH:mm or HH:mm:ss
  close: string;
}

export interface DayEntry {
  day: DayName;
  closed: boolean;
  slots: TimeSlot[];
}

export interface OperationHoursData {
  hours: Array< { day: string; hours: string } >;
}

function formatTimeForApi(value: string): string {
  if (!value) return "00:00:00";
  const parts = value.split(":");
  if (parts.length === 2) return `${value}:00`;
  return value;
}

function parseHoursString(hoursStr: string): { closed: boolean; slots: TimeSlot[] } {
  const trimmed = (hoursStr || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "closed") {
    return { closed: true, slots: [] };
  }
  const slots: TimeSlot[] = [];
  const ranges = trimmed.split(",").map((s) => s.trim());
  for (const range of ranges) {
    const [open, close] = range.split(/\s*-\s*/).map((s) => s.trim());
    if (open && close) {
      slots.push({
        open: open.length === 5 ? `${open}:00` : open,
        close: close.length === 5 ? `${close}:00` : close,
      });
    }
  }
  return { closed: false, slots: slots.length ? slots : [{ open: "09:00:00", close: "17:00:00" }] };
}

function dayEntryToHoursString(entry: DayEntry): string {
  if (entry.closed || entry.slots.length === 0) return "Closed";
  return entry.slots
    .map((s) => `${formatTimeForApi(s.open)} - ${formatTimeForApi(s.close)}`)
    .join(", ");
}

function parseOperationHoursJson(json: string): { dayEntries: DayEntry[] } {
  const dayEntries: DayEntry[] = DAYS.map((day) => ({
    day,
    closed: true,
    slots: [],
  }));

  if (!json?.trim()) return { dayEntries };

  try {
    const data = JSON.parse(json) as OperationHoursData;
    if (Array.isArray(data.hours)) {
      for (const row of data.hours) {
        const dayName = (row.day || "").trim();
        const dayIndex = DAYS.findIndex((d) => d.toLowerCase() === dayName.toLowerCase());
        if (dayIndex === -1) continue;
        const { closed, slots } = parseHoursString(row.hours || "");
        dayEntries[dayIndex] = {
          day: DAYS[dayIndex],
          closed,
          slots: slots.map((s) => ({
            open: s.open.length === 8 ? s.open.slice(0, 5) : s.open,
            close: s.close.length === 8 ? s.close.slice(0, 5) : s.close,
          })),
        };
      }
    }
  } catch {
    // keep defaults
  }
  return { dayEntries };
}

function buildOperationHoursJson(dayEntries: DayEntry[]): string {
  const data: OperationHoursData = {
    hours: dayEntries.map((entry) => ({
      day: entry.day,
      hours: dayEntryToHoursString(entry),
    })),
  };
  return JSON.stringify(data, null, 2);
}

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
  const [dayEntries, setDayEntries] = useState<DayEntry[]>(() =>
    DAYS.map((day) => ({ day, closed: true, slots: [] }))
  );

  useEffect(() => {
    if (open) {
      const { dayEntries: entries } = parseOperationHoursJson(value);
      setDayEntries(entries);
    }
  }, [open, value]);

  const updateDay = useCallback((index: number, updater: (prev: DayEntry) => DayEntry) => {
    setDayEntries((prev) => {
      const next = [...prev];
      next[index] = updater(prev[index]);
      return next;
    });
  }, []);

  const setDayClosed = (index: number, closed: boolean) => {
    updateDay(index, (prev) =>
      closed ? { ...prev, closed: true, slots: [] } : { ...prev, closed: false, slots: [{ open: "09:00", close: "17:00" }] }
    );
  };

  const addSlot = (dayIndex: number) => {
    updateDay(dayIndex, (prev) => ({
      ...prev,
      slots: [...prev.slots, { open: "09:00", close: "17:00" }],
    }));
  };

  const removeSlot = (dayIndex: number, slotIndex: number) => {
    updateDay(dayIndex, (prev) => {
      const slots = prev.slots.filter((_, i) => i !== slotIndex);
      return { ...prev, slots, closed: slots.length === 0 };
    });
  };

  const updateSlot = (dayIndex: number, slotIndex: number, field: "open" | "close", time: string) => {
    updateDay(dayIndex, (prev) => {
      const slots = [...prev.slots];
      slots[slotIndex] = { ...slots[slotIndex], [field]: time };
      return { ...prev, slots };
    });
  };

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
            Set opening hours for each day. Use &quot;Closed&quot; or add one or more time ranges. Save when done.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="border rounded-lg divide-y bg-muted/30">
            {dayEntries.map((entry, dayIndex) => (
              <div key={entry.day} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm w-24 shrink-0">{entry.day}</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Button
                      type="button"
                      variant={entry.closed ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => setDayClosed(dayIndex, true)}
                    >
                      Closed
                    </Button>
                    <Button
                      type="button"
                      variant={!entry.closed ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => setDayClosed(dayIndex, false)}
                    >
                      Open
                    </Button>
                    {!entry.closed && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => addSlot(dayIndex)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add slot
                      </Button>
                    )}
                  </div>
                </div>

                {!entry.closed && entry.slots.length > 0 && (
                  <div className="space-y-2 pl-0 sm:pl-24">
                    {entry.slots.map((slot, slotIndex) => (
                      <div
                        key={slotIndex}
                        className="flex items-center gap-2 flex-wrap"
                      >
                        <Input
                          type="time"
                          value={slot.open}
                          onChange={(e) => updateSlot(dayIndex, slotIndex, "open", e.target.value)}
                          className="w-28 h-8 text-sm"
                        />
                        <span className="text-muted-foreground text-sm">–</span>
                        <Input
                          type="time"
                          value={slot.close}
                          onChange={(e) => updateSlot(dayIndex, slotIndex, "close", e.target.value)}
                          className="w-28 h-8 text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeSlot(dayIndex, slotIndex)}
                          aria-label="Remove time slot"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
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
