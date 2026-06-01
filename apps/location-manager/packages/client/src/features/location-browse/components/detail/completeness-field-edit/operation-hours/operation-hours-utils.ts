export const DAYS = [
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
  open: string;
  close: string;
}

export interface DayEntry {
  day: DayName;
  closed: boolean;
  slots: TimeSlot[];
}

interface OperationHoursData {
  hours: Array<{ day: string; hours: string }>;
}

function formatTimeForApi(value: string): string {
  if (!value) return "00:00:00";
  return value.split(":").length === 2 ? `${value}:00` : value;
}

function parseHoursString(hoursStr: string): { closed: boolean; slots: TimeSlot[] } {
  const trimmed = (hoursStr || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "closed") {
    return { closed: true, slots: [] };
  }
  const slots = trimmed
    .split(",")
    .map((range) => range.trim().split(/\s*-\s*/).map((part) => part.trim()))
    .filter(([open, close]) => open && close)
    .map(([open, close]) => ({
      open: open.length === 5 ? `${open}:00` : open,
      close: close.length === 5 ? `${close}:00` : close,
    }));
  return {
    closed: false,
    slots: slots.length ? slots : [{ open: "09:00:00", close: "17:00:00" }],
  };
}

export function createClosedDayEntries(): DayEntry[] {
  return DAYS.map((day) => ({ day, closed: true, slots: [] }));
}

export function parseOperationHoursJson(json: string): DayEntry[] {
  const dayEntries = createClosedDayEntries();
  if (!json?.trim()) return dayEntries;

  try {
    const data = JSON.parse(json) as OperationHoursData;
    if (!Array.isArray(data.hours)) return dayEntries;
    for (const row of data.hours) {
      const dayIndex = DAYS.findIndex((day) => day.toLowerCase() === (row.day || "").trim().toLowerCase());
      if (dayIndex === -1) continue;
      const { closed, slots } = parseHoursString(row.hours || "");
      dayEntries[dayIndex] = {
        day: DAYS[dayIndex],
        closed,
        slots: slots.map((slot) => ({
          open: slot.open.length === 8 ? slot.open.slice(0, 5) : slot.open,
          close: slot.close.length === 8 ? slot.close.slice(0, 5) : slot.close,
        })),
      };
    }
  } catch {
    // Keep defaults when JSON parsing fails.
  }
  return dayEntries;
}

export function buildOperationHoursJson(dayEntries: DayEntry[]): string {
  const data: OperationHoursData = {
    hours: dayEntries.map((entry) => ({
      day: entry.day,
      hours: entry.closed || entry.slots.length === 0
        ? "Closed"
        : entry.slots
            .map((slot) => `${formatTimeForApi(slot.open)} - ${formatTimeForApi(slot.close)}`)
            .join(", "),
    })),
  };
  return JSON.stringify(data, null, 2);
}
