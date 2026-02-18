interface OperationHoursData {
  hours: Array<{ day: string; hours: string }>;
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

export function isOperationHoursJson(value: string): boolean {
  return parseOperationHoursData(value) !== null;
}

export function buildOperationHoursSummary(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const parsed = parseOperationHoursData(trimmed);
  if (!parsed) return trimmed;

  const rows = parsed.hours.filter((row) => (row.hours || '').trim().toLowerCase() !== 'closed');
  if (rows.length === 0) return 'Closed';

  return rows
    .map((row) => `${row.day}: ${(row.hours || '').trim()}`)
    .join('; ');
}
