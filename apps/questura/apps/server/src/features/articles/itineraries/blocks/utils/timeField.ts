/**
 * Shared time field configuration and utility functions for itinerary blocks
 */

/**
 * Convert 12-hour time to 24-hour format
 * @param hour - Hour in 12-hour format (1-12)
 * @param minute - Minute as string ('00', '15', '30', '45')
 * @param period - AM or PM
 * @returns Time in 24-hour format as string (HH:MM)
 */
export function convertTo24Hour(hour: number, minute: string, period: string): string {
  let hour24 = hour
  if (period === 'PM' && hour !== 12) hour24 += 12
  if (period === 'AM' && hour === 12) hour24 = 0
  return `${hour24.toString().padStart(2, '0')}:${minute}`
}

/**
 * Calculate end time based on start time and duration
 * @param startHour - Start hour in 12-hour format (1-12)
 * @param startMinute - Start minute as string ('00', '15', '30', '45')
 * @param startPeriod - AM or PM
 * @param durationHours - Duration in hours
 * @param durationMinutes - Duration in minutes (number or string)
 * @returns End time in 24-hour format as string (HH:MM)
 */
export function calculateEndTime(
  startHour: number,
  startMinute: string,
  startPeriod: string,
  durationHours: number,
  durationMinutes: number | string
): string {
  // Convert start time to 24-hour format
  const start24 = convertTo24Hour(startHour, startMinute, startPeriod)
  const [startH, startM] = start24.split(':').map(Number)

  // Calculate total minutes - convert string to number if needed
  const totalStartMinutes = startH * 60 + startM
  const durMins = typeof durationMinutes === 'string' ? parseInt(durationMinutes, 10) : durationMinutes
  const totalDurationMinutes = durationHours * 60 + durMins
  const totalEndMinutes = totalStartMinutes + totalDurationMinutes

  // Convert back to hours and minutes
  const endHour = Math.floor(totalEndMinutes / 60) % 24
  const endMinute = totalEndMinutes % 60

  return `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`
}

/**
 * Reusable time field configuration for itinerary blocks
 */
export const timeField = {
  type: 'row' as const,
  fields: [
    {
      name: 'timeHour',
      type: 'number' as const,
      min: 1,
      max: 12,
      required: true,
      admin: {
        width: '30%',
        placeholder: '10',
        description: 'Hour',
      },
    },
    {
      name: 'timeMinute',
      type: 'select' as const,
      dbName: 'time_min', // Shortened database name
      required: true,
      options: [
        { label: '00', value: '00' },
        { label: '15', value: '15' },
        { label: '30', value: '30' },
        { label: '45', value: '45' },
      ],
      defaultValue: '00',
      admin: {
        width: '30%',
        description: 'Minute',
      },
    },
    {
      name: 'timePeriod',
      type: 'select' as const,
      dbName: 'time_period', // Shortened database name
      required: true,
      options: [
        { label: 'AM', value: 'AM' },
        { label: 'PM', value: 'PM' },
      ],
      admin: {
        width: '40%',
        description: 'AM/PM',
      },
    },
  ],
}

/**
 * Duration field configuration for itinerary blocks
 */
export const durationField = {
  name: 'duration',
  type: 'row' as const,
  fields: [
    {
      name: 'durationHours',
      type: 'number' as const,
      min: 0,
      max: 12,
      defaultValue: 1,
      admin: {
        width: '50%',
        placeholder: '1',
        description: 'Hours',
      },
    },
    {
      name: 'durationMinutes',
      type: 'select' as const,
      dbName: 'dur_min', // Shortened database name to avoid 63 char limit
      options: [
        { label: '0 min', value: '0' },
        { label: '15 min', value: '15' },
        { label: '30 min', value: '30' },
        { label: '45 min', value: '45' },
      ],
      defaultValue: '0',
      admin: {
        width: '50%',
        description: 'Minutes',
      },
    },
  ],
}

