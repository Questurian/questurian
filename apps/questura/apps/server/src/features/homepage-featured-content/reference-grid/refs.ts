export type NumericReferenceRef = {
  id: number
}

export type ParsedNumericReferenceSlot<TRef extends NumericReferenceRef = NumericReferenceRef> = {
  slot: number
  ref: TRef | null
  reason: 'invalid_reference' | null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

export function normalizeNumericReference(value: unknown): NumericReferenceRef | null {
  if (typeof value === 'number' || typeof value === 'string') {
    const id = normalizeNumericId(value)
    return id ? { id } : null
  }

  if (!isRecord(value)) return null
  const directId = normalizeNumericId(value.id)
  if (directId !== null) return { id: directId }
  if (isRecord(value.value)) {
    const nestedId = normalizeNumericId(value.value.id)
    if (nestedId !== null) return { id: nestedId }
  }
  const valueId = normalizeNumericId(value.value)
  if (valueId !== null) return { id: valueId }
  return null
}

export function normalizeNumericReferenceInput<TRef extends NumericReferenceRef>(
  rawItems: unknown,
  errorMessage: string,
): TRef[] {
  if (!Array.isArray(rawItems)) return []
  const refs = rawItems.map((item) => normalizeNumericReference(item))
  if (refs.some((item) => item === null)) {
    throw new Error(errorMessage)
  }
  return refs as TRef[]
}

export function parseNumericReferenceSlots<TRef extends NumericReferenceRef>(
  rawItems: unknown,
): ParsedNumericReferenceSlot<TRef>[] {
  if (!Array.isArray(rawItems)) return []
  return rawItems.map((rawItem, index) => {
    const ref = normalizeNumericReference(rawItem) as TRef | null
    return { slot: index + 1, ref, reason: ref ? null : 'invalid_reference' }
  })
}

export function buildNumericReferenceGridData<TRef extends NumericReferenceRef>(items: TRef[]) {
  return { items: items.map((item) => item.id) }
}

export function toReferenceKey(ref: { relationTo?: string; id: number }): string {
  return ref.relationTo ? `${ref.relationTo}:${ref.id}` : String(ref.id)
}
