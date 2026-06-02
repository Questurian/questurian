export function formatDate(dateString: string): string {
  if (!dateString) return 'Unknown'
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateString
  }
}

export function shortRunId(runId: string): string {
  if (!runId) return 'n/a'
  return `${runId.slice(0, 8)}...`
}
