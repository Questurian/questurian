const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type WeekdayName = (typeof WEEKDAY_NAMES)[number];

interface GoogleOpeningHoursPeriodBoundary {
  day?: number;
  time?: string;
}

export interface GoogleOpeningHours {
  open_now?: boolean;
  periods?: Array<{
    open?: GoogleOpeningHoursPeriodBoundary;
    close?: GoogleOpeningHoursPeriodBoundary;
  }>;
  weekday_text?: string[];
}

export interface NormalizedOperationHours {
  hours: Array<{ day: WeekdayName; hours: string }>;
}

function formatGoogleTimeToApiTime(rawTime?: string): string | null {
  if (typeof rawTime !== "string") return null;
  const trimmed = rawTime.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;

  const hour = Number(trimmed.slice(0, 2));
  const minute = Number(trimmed.slice(2, 4));
  if (hour > 23 || minute > 59) return null;

  return `${trimmed.slice(0, 2)}:${trimmed.slice(2, 4)}:00`;
}

function pushSlotForDay(daySlots: string[][], day: number, start: string, end: string): void {
  if (day < 0 || day > 6) return;
  daySlots[day]!.push(`${start} - ${end}`);
}

function normalizeWeekdayNameToIndex(rawDay: string): number {
  const aliases: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };

  return aliases[rawDay.trim().toLowerCase()] ?? -1;
}

function normalize12HourTimeToApiTime(rawTime: string): string | null {
  const normalized = rawTime
    .replace(/[.\u00A0\u202F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "00");
  if (hour < 1 || hour > 12 || minute > 59) return null;

  if (match[3] === "AM") {
    hour = hour === 12 ? 0 : hour;
  } else {
    hour = hour === 12 ? 12 : hour + 12;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function normalizeGoogleWeekdayTextToOperationHours(
  weekdayText: string[] | undefined
): NormalizedOperationHours | null {
  if (!Array.isArray(weekdayText) || weekdayText.length === 0) return null;

  const hoursByDay = new Map<number, string[]>();
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    hoursByDay.set(dayIndex, []);
  }

  for (const rawLine of weekdayText) {
    if (typeof rawLine !== "string") continue;
    const normalizedLine = rawLine
      .replace(/\u00A0|\u202F/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const separatorIndex = normalizedLine.indexOf(":");
    if (separatorIndex === -1) continue;

    const rawDay = normalizedLine.slice(0, separatorIndex);
    const rawHours = normalizedLine.slice(separatorIndex + 1).trim();
    if (!rawDay || !rawHours) continue;

    const dayIndex = normalizeWeekdayNameToIndex(rawDay);
    if (dayIndex === -1) continue;

    const normalizedHours = rawHours.trim().toLowerCase();
    if (!normalizedHours || normalizedHours.includes("closed")) continue;
    if (normalizedHours.includes("open 24")) {
      hoursByDay.get(dayIndex)!.push("00:00:00 - 23:59:59");
      continue;
    }

    const segments = rawHours
      .replace(/[–—−]/g, "-")
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      const [openRaw, closeRaw] = segment.split(/\s*-\s*/);
      if (!openRaw || !closeRaw) continue;

      const open = normalize12HourTimeToApiTime(openRaw);
      const close = normalize12HourTimeToApiTime(closeRaw);
      if (open && close) hoursByDay.get(dayIndex)!.push(`${open} - ${close}`);
    }
  }

  return {
    hours: WEEKDAY_NAMES.map((dayName, index) => {
      const slots = Array.from(new Set(hoursByDay.get(index)!)).sort();
      return { day: dayName, hours: slots.length > 0 ? slots.join(", ") : "Closed" };
    }),
  };
}

export function normalizeGoogleOpeningHours(
  openingHours: GoogleOpeningHours | undefined
): NormalizedOperationHours | null {
  if (!openingHours) return null;

  const daySlots: string[][] = Array.from({ length: 7 }, () => []);
  const periods = Array.isArray(openingHours.periods) ? openingHours.periods : [];

  for (const period of periods) {
    const openDay = period.open?.day;
    const openTime = formatGoogleTimeToApiTime(period.open?.time);
    const closeDay = period.close?.day;
    const closeTime = formatGoogleTimeToApiTime(period.close?.time);

    if (typeof openDay !== "number" || openDay < 0 || openDay > 6 || !openTime) continue;

    if (typeof closeDay !== "number" || closeDay < 0 || closeDay > 6 || !closeTime) {
      pushSlotForDay(daySlots, openDay, openTime, "23:59:59");
      continue;
    }

    let dayDiff = (closeDay - openDay + 7) % 7;
    if (dayDiff === 0) {
      if (closeTime > openTime) {
        pushSlotForDay(daySlots, openDay, openTime, closeTime);
        continue;
      }
      if (closeTime === openTime) {
        pushSlotForDay(daySlots, openDay, "00:00:00", "23:59:59");
        continue;
      }
      dayDiff = 1;
    }

    pushSlotForDay(daySlots, openDay, openTime, "23:59:59");
    for (let offset = 1; offset < dayDiff; offset += 1) {
      pushSlotForDay(daySlots, (openDay + offset) % 7, "00:00:00", "23:59:59");
    }
    pushSlotForDay(daySlots, closeDay, "00:00:00", closeTime);
  }

  if (!daySlots.some((slots) => slots.length > 0)) {
    return normalizeGoogleWeekdayTextToOperationHours(openingHours.weekday_text);
  }

  return {
    hours: WEEKDAY_NAMES.map((dayName, index) => {
      const slots = Array.from(new Set(daySlots[index]!)).sort();
      return { day: dayName, hours: slots.length > 0 ? slots.join(", ") : "Closed" };
    }),
  };
}
