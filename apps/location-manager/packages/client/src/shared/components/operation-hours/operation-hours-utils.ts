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

function timeToMinutes(value: string): string {
  return value.trim().slice(0, 5);
}

function isFullDaySlot(slot: TimeSlot): boolean {
  return timeToMinutes(slot.open) === "00:00" && timeToMinutes(slot.close) === "23:59";
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
      open: open.length === 8 ? open.slice(0, 5) : open,
      close: close.length === 8 ? close.slice(0, 5) : close,
    }));

  return {
    closed: false,
    slots: slots.length ? slots : [{ open: "09:00", close: "17:00" }],
  };
}

function parseOperationHoursData(value: string): OperationHoursData | null {
  if (!value.trim()) return null;

  try {
    const parsed = JSON.parse(value) as Partial<OperationHoursData>;
    if (!Array.isArray(parsed.hours)) return null;
    return { hours: parsed.hours };
  } catch {
    return null;
  }
}

export function createClosedDayEntries(): DayEntry[] {
  return DAYS.map((day) => ({ day, closed: true, slots: [] }));
}

export function createOpen24HoursDayEntries(): DayEntry[] {
  return DAYS.map((day) => ({
    day,
    closed: false,
    slots: [{ open: "00:00", close: "23:59" }],
  }));
}

export function isOpen24Hours(dayEntries: DayEntry[]): boolean {
  if (dayEntries.length !== DAYS.length) return false;

  return DAYS.every((day) => {
    const entry = dayEntries.find((candidate) => candidate.day === day);
    return Boolean(
      entry &&
      !entry.closed &&
      entry.slots.length === 1 &&
      isFullDaySlot(entry.slots[0])
    );
  });
}

export function parseOperationHoursJson(json: string): DayEntry[] {
  const dayEntries = createClosedDayEntries();
  const data = parseOperationHoursData(json);
  if (!data) return dayEntries;

  for (const row of data.hours) {
    const dayIndex = DAYS.findIndex(
      (day) => day.toLowerCase() === (row.day || "").trim().toLowerCase()
    );
    if (dayIndex === -1) continue;

    const { closed, slots } = parseHoursString(row.hours || "");
    dayEntries[dayIndex] = { day: DAYS[dayIndex], closed, slots };
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
            .map((slot) =>
              isFullDaySlot(slot)
                ? "00:00:00 - 23:59:59"
                : `${formatTimeForApi(slot.open)} - ${formatTimeForApi(slot.close)}`
            )
            .join(", "),
    })),
  };

  return JSON.stringify(data, null, 2);
}

export function isOperationHoursJson(value: string): boolean {
  return parseOperationHoursData(value) !== null;
}

export function buildOperationHoursSummary(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const parsed = parseOperationHoursData(trimmed);
  if (!parsed) return trimmed;

  const rows = parsed.hours.filter((row) => (row.hours || "").trim().toLowerCase() !== "closed");
  if (rows.length === 0) return "Closed";
  if (isOpen24Hours(parseOperationHoursJson(trimmed))) return "Open 24/7";

  return rows
    .map((row) => `${row.day}: ${(row.hours || "").trim()}`)
    .join("; ");
}
