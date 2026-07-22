import { useCallback, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input } from "@client/components/ui";
import {
  createClosedDayEntries,
  createOpen24HoursDayEntries,
  isOpen24Hours,
  type DayEntry,
} from "./operation-hours-utils";

interface OperationHoursEditorProps {
  dayEntries: DayEntry[];
  onChange: (entries: DayEntry[]) => void;
}

function cloneEntries(entries: DayEntry[]): DayEntry[] {
  return entries.map((entry) => ({
    ...entry,
    slots: entry.slots.map((slot) => ({ ...slot })),
  }));
}

export function OperationHoursEditor({
  dayEntries,
  onChange,
}: OperationHoursEditorProps) {
  const previousCustomSchedule = useRef<DayEntry[] | null>(null);
  const open24Hours = isOpen24Hours(dayEntries);

  const updateDay = useCallback((index: number, updater: (prev: DayEntry) => DayEntry) => {
    const next = [...dayEntries];
    next[index] = updater(dayEntries[index]);
    onChange(next);
  }, [dayEntries, onChange]);

  const setOpen24Hours = (checked: boolean) => {
    if (checked) {
      previousCustomSchedule.current = cloneEntries(dayEntries);
      onChange(createOpen24HoursDayEntries());
      return;
    }

    onChange(previousCustomSchedule.current ?? createClosedDayEntries());
    previousCustomSchedule.current = null;
  };

  const setDayClosed = (index: number, closed: boolean) => {
    updateDay(index, (prev) =>
      closed
        ? { ...prev, closed: true, slots: [] }
        : { ...prev, closed: false, slots: [{ open: "09:00", close: "17:00" }] }
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
      const slots = prev.slots.filter((_, index) => index !== slotIndex);
      return { ...prev, slots, closed: slots.length === 0 };
    });
  };

  const updateSlot = (
    dayIndex: number,
    slotIndex: number,
    slotField: "open" | "close",
    time: string
  ) => {
    updateDay(dayIndex, (prev) => {
      const slots = [...prev.slots];
      slots[slotIndex] = { ...slots[slotIndex], [slotField]: time };
      return { ...prev, slots };
    });
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={open24Hours}
          onChange={(event) => setOpen24Hours(event.target.checked)}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        Open 24/7
      </label>

      {!open24Hours && (
        <div className="border rounded-lg divide-y bg-muted/30">
          {dayEntries.map((entry, dayIndex) => (
            <div key={entry.day} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium text-sm w-24 shrink-0">{entry.day}</span>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Button type="button" variant={entry.closed ? "secondary" : "ghost"} size="sm" className="h-7 text-xs px-2" onClick={() => setDayClosed(dayIndex, true)}>
                    Closed
                  </Button>
                  <Button type="button" variant={!entry.closed ? "secondary" : "ghost"} size="sm" className="h-7 text-xs px-2" onClick={() => setDayClosed(dayIndex, false)}>
                    Open
                  </Button>
                  {!entry.closed && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => addSlot(dayIndex)}>
                      <Plus className="h-3.5 w-3.5" />
                      Add slot
                    </Button>
                  )}
                </div>
              </div>

              {!entry.closed && entry.slots.length > 0 && (
                <div className="space-y-2 pl-0 sm:pl-24">
                  {entry.slots.map((slot, slotIndex) => (
                    <div key={slotIndex} className="flex items-center gap-2 flex-wrap">
                      <Input type="time" value={slot.open} onChange={(event) => updateSlot(dayIndex, slotIndex, "open", event.target.value)} className="w-28 h-8 text-sm" />
                      <span className="text-muted-foreground text-sm">-</span>
                      <Input type="time" value={slot.close} onChange={(event) => updateSlot(dayIndex, slotIndex, "close", event.target.value)} className="w-28 h-8 text-sm" />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeSlot(dayIndex, slotIndex)} aria-label="Remove time slot">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
