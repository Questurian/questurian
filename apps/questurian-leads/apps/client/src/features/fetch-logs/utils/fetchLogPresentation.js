export function formatFetchLogDateTime(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function getFetchLogStatusClass(status) {
  return status?.toLowerCase() || '';
}
