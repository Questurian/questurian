type ExperienceBlock = [unknown, unknown]

const SENTIMENT_MAP: Record<number, string> = {
  [-1]: 'negative',
  0: 'neutral',
  1: 'positive'
}

const GROUP_MAP: Record<number, string> = {
  0: 'other',
  1: 'solo',
  2: 'couple',
  3: 'family',
  4: 'friends',
  5: 'business',
  6: 'special_event'
}

const MEAL_MAP: Record<number, string> = {
  0: 'unknown',
  1: 'breakfast',
  2: 'brunch',
  3: 'lunch',
  4: 'dinner',
  5: 'late-night',
  6: 'drinks'
}

const OCCASION_MAP: Record<number, string> = {
  0: 'none',
  1: 'casual',
  2: 'celebration',
  3: 'date',
  4: 'business'
}

const TONE_MAP: Record<number, string> = {
  1: 'romantic',
  2: 'angry',
  3: 'casual',
  4: 'excited',
  5: 'poetic',
  6: 'nostalgic',
  7: 'sarcastic',
  8: 'humorous',
  9: 'critical',
  10: 'appreciative',
  11: 'neutral'
}

const SPECIFICITY_MAP: Record<number, string> = {
  1: 'low',
  2: 'medium',
  3: 'high'
}

const INTENSITY_MAP: Record<number, string> = {
  0: 'none',
  1: 'low',
  2: 'medium',
  3: 'high'
}

const coerceInt = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

const normalizeArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
  }
  if (value === null || value === undefined) {
    return []
  }
  return [value]
}

const expandBlock = (block: unknown) => {
  let descriptors: unknown[] = []
  let intensityCode = 0
  if (Array.isArray(block) && block.length >= 2) {
    const [rawDescriptors, rawIntensity] = block as ExperienceBlock
    descriptors = normalizeArray(rawDescriptors)
    intensityCode = coerceInt(rawIntensity, 0)
  }
  return {
    descriptors,
    intensity: INTENSITY_MAP[intensityCode] ?? 'none'
  }
}

const looksCompactSignal = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return false
  }
  return 'd' in value && 'vc' in value && 'e' in value
}

const rehydrateSignal = (signal: unknown) => {
  if (!signal || typeof signal !== 'object') {
    return signal
  }

  const rawSignal = signal as Record<string, unknown>
  const vc = normalizeArray(rawSignal.vc)
  const experience = rawSignal.e && typeof rawSignal.e === 'object' ? (rawSignal.e as Record<string, unknown>) : {}

  return {
    date: rawSignal.d ?? null,
    rating: rawSignal.r ?? null,
    sentiment: SENTIMENT_MAP[coerceInt(rawSignal.s, 0)] ?? 'unknown',
    visit_context: {
      group: GROUP_MAP[coerceInt(vc[0], 0)] ?? 'other',
      meal: MEAL_MAP[coerceInt(vc[1], 0)] ?? 'unknown',
      occasion: OCCASION_MAP[coerceInt(vc[2], 0)] ?? 'none'
    },
    experience: {
      food: expandBlock(experience.f),
      service: expandBlock(experience.sv),
      atmosphere: expandBlock(experience.a),
      location: expandBlock(experience.l),
      value: expandBlock(experience.v)
    },
    dishes_mentioned: normalizeArray(rawSignal.dm),
    standout_phrases: normalizeArray(rawSignal.sp),
    tones: normalizeArray(rawSignal.t).map(code => TONE_MAP[coerceInt(code, 0)] ?? 'unknown'),
    tags: normalizeArray(rawSignal.tg),
    specificity: SPECIFICITY_MAP[coerceInt(rawSignal.spc, 1)] ?? 'low'
  }
}

export const rehydrateExperienceList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return value
  }
  const shouldRehydrate = value.some(item => looksCompactSignal(item))
  if (!shouldRehydrate) {
    return value
  }
  return value.map(item => rehydrateSignal(item))
}
