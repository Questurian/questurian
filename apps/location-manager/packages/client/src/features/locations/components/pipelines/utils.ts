/**
 * Utility functions for pipeline checklist rendering
 * Icons, colors, labels for different status states
 */

export const STATUS_ICONS = {
  complete: '✅',
  missing: '❌',
  invalid: '⚠️',
  progress: '⏳',
  not_started: '⭕',
  waiting: '⏸️',
  in_progress: '▶️',
} as const;

export const STATUS_COLORS = {
  complete: 'text-green-600 bg-green-50',
  missing: 'text-red-600 bg-red-50',
  invalid: 'text-amber-600 bg-amber-50',
  progress: 'text-blue-600 bg-blue-50',
  not_started: 'text-gray-500 bg-gray-50',
  waiting: 'text-gray-500 bg-gray-50',
  in_progress: 'text-blue-600 bg-blue-50',
} as const;

export const BADGE_COLORS = {
  complete: 'bg-green-100 text-green-800',
  missing: 'bg-red-100 text-red-800',
  invalid: 'bg-amber-100 text-amber-800',
  progress: 'bg-blue-100 text-blue-800',
  not_started: 'bg-gray-100 text-gray-800',
  waiting: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
} as const;

export function getStatusIcon(status: string): string {
  return (STATUS_ICONS as Record<string, string>)[status] || '❓';
}

export function getStatusColor(status: string): string {
  return (STATUS_COLORS as Record<string, string>)[status] || 'text-gray-600 bg-gray-50';
}

export function getBadgeColor(status: string): string {
  return (BADGE_COLORS as Record<string, string>)[status] || 'bg-gray-100 text-gray-800';
}

export function getCompletionBarColor(percent: number): string {
  if (percent >= 80) return 'bg-green-500';
  if (percent >= 60) return 'bg-blue-500';
  if (percent >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function formatCompletionText(current: number, total: number): string {
  const percent = Math.round((current / total) * 100);
  return `${current}/${total} (${percent}%)`;
}

export function getReadinessLabel(canSync: boolean): string {
  return canSync ? '✅ Ready to sync' : '⚠️ Missing required fields';
}
