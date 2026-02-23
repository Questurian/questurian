export const itineraryTimeRow = {
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
        description: 'Hour',
      },
    },
    {
      name: 'timeMinute',
      type: 'select' as const,
      dbName: 'time_min',
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
      dbName: 'time_period',
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

export const itineraryDurationRow = {
  name: 'duration',
  type: 'row' as const,
  fields: [
    {
      name: 'durationHours',
      type: 'number' as const,
      min: 0,
      max: 24,
      defaultValue: 1,
      required: true,
      admin: {
        width: '50%',
        description: 'Hours',
      },
    },
    {
      name: 'durationMinutes',
      type: 'select' as const,
      dbName: 'dur_min',
      required: true,
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

export const toMinutesFromMidnight = (
  hour: number,
  minute: string | number,
  period: string,
): number => {
  const safeHour = Number(hour)
  const safeMinute = typeof minute === 'string' ? Number.parseInt(minute, 10) : Number(minute)

  if (!Number.isInteger(safeHour) || safeHour < 1 || safeHour > 12) {
    throw new Error('Invalid hour. Expected a value between 1 and 12.')
  }

  if (!Number.isInteger(safeMinute) || safeMinute < 0 || safeMinute > 59) {
    throw new Error('Invalid minute. Expected a value between 0 and 59.')
  }

  if (period !== 'AM' && period !== 'PM') {
    throw new Error('Invalid period. Expected AM or PM.')
  }

  let hour24 = safeHour
  if (period === 'PM' && safeHour !== 12) hour24 += 12
  if (period === 'AM' && safeHour === 12) hour24 = 0

  return hour24 * 60 + safeMinute
}

export const durationToMinutes = (
  durationHours: number | undefined,
  durationMinutes: string | number | undefined,
): number => {
  const hours = Number(durationHours ?? 0)
  const minutes =
    typeof durationMinutes === 'string'
      ? Number.parseInt(durationMinutes, 10)
      : Number(durationMinutes ?? 0)

  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error('Invalid duration hours.')
  }

  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    throw new Error('Invalid duration minutes.')
  }

  return hours * 60 + minutes
}

export const calculateEndMinutes = (startMinutes: number, durationMinutes: number): number => {
  return startMinutes + durationMinutes
}
