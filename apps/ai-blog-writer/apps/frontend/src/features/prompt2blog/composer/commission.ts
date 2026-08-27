import type {
  Prompt2BlogCommission,
  Prompt2BlogCommissionDraft,
  Prompt2BlogDirectionOption,
  Prompt2BlogEditorialOptionsResponse
} from '../api'
import {
  validateDirectionOption,
  type DirectionImportIssue
} from './direction-import'

const COMMISSION_KEYS = [
  'schema_version',
  'original_title',
  'location',
  'approved_direction',
  'form_id',
  'topic_module_ids',
  'audience',
  'core_reader_question',
  'reader_outcome',
  'primary_subject',
  'scope',
  'premise',
  'requirements',
  'exclusions',
  'call_to_action'
] as const

function copyDirectionOption(
  option: Prompt2BlogDirectionOption
): Prompt2BlogDirectionOption {
  return {
    ...option,
    topic_module_ids: [...option.topic_module_ids],
    audience: {
      ...option.audience,
      tags: [...(option.audience.tags ?? [])]
    },
    scope: {
      ...option.scope,
      references: option.scope.references.map((reference) => ({ ...reference }))
    },
    premise: (option.premise ?? []).map((assumption) => ({ ...assumption })),
    requirements: option.requirements.map((requirement) => ({
      ...requirement,
      assumption_ids: [...(requirement.assumption_ids ?? [])]
    })),
    exclusions: [...option.exclusions]
  }
}

export function createCommissionDraft(
  title: string,
  location: string,
  option: Prompt2BlogDirectionOption
): Prompt2BlogCommissionDraft {
  const copied = copyDirectionOption(option)
  return {
    schema_version: 3,
    original_title: title,
    location,
    approved_direction: copied.direction,
    form_id: copied.form_id,
    topic_module_ids: copied.topic_module_ids,
    audience: copied.audience,
    core_reader_question: copied.core_reader_question,
    reader_outcome: copied.reader_outcome,
    primary_subject: copied.primary_subject,
    scope: copied.scope,
    premise: copied.premise,
    requirements: copied.requirements,
    exclusions: copied.exclusions,
    call_to_action: null
  }
}

export function validateCommissionDraft(
  draft: Prompt2BlogCommissionDraft,
  catalog: Prompt2BlogEditorialOptionsResponse
): DirectionImportIssue[] {
  const issues: DirectionImportIssue[] = []
  const record = draft as unknown as Record<string, unknown>
  const allowedKeys = new Set<string>(COMMISSION_KEYS)
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      issues.push({ path: `commission.${key}`, message: 'Unexpected key.' })
    }
  }
  for (const key of COMMISSION_KEYS) {
    if (!(key in record)) {
      issues.push({
        path: `commission.${key}`,
        message: 'Missing required key.'
      })
    }
  }
  if (draft.schema_version !== 3) {
    issues.push({ path: 'commission.schema_version', message: 'Must equal 3.' })
  }
  for (const [key, value] of [
    ['original_title', draft.original_title],
    ['location', draft.location]
  ] as const) {
    if (typeof value !== 'string' || !value.trim()) {
      issues.push({
        path: `commission.${key}`,
        message: 'Must be a non-empty string.'
      })
    }
  }
  if (
    draft.call_to_action !== null &&
    draft.call_to_action !== undefined &&
    typeof draft.call_to_action !== 'string'
  ) {
    issues.push({
      path: 'commission.call_to_action',
      message: 'Must be a string or null.'
    })
  }

  const option: Prompt2BlogDirectionOption = {
    option_id: 'direction-1',
    direction: draft.approved_direction,
    form_id: draft.form_id,
    topic_module_ids: draft.topic_module_ids ?? [],
    audience: draft.audience,
    core_reader_question: draft.core_reader_question,
    reader_outcome: draft.reader_outcome,
    primary_subject: draft.primary_subject,
    scope: draft.scope,
    premise: draft.premise ?? [],
    requirements: draft.requirements,
    exclusions: draft.exclusions ?? [],
    rationale: draft.approved_direction
  }
  issues.push(
    ...validateDirectionOption(option, catalog).map((issue) => ({
      ...issue,
      path: issue.path.replace(/^options\[0\]/, 'commission')
    }))
  )
  return issues
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Commission contains a non-finite number.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  throw new TypeError(`Commission contains unsupported ${typeof value} value.`)
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount))
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const

function sha256Hex(input: string): string {
  const source = new TextEncoder().encode(input)
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64
  const bytes = new Uint8Array(paddedLength)
  bytes.set(source)
  bytes[source.length] = 0x80
  const bitLength = source.length * 8
  const view = new DataView(bytes.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19
  ])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4)
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]
      const right = words[index - 2]
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)
      const sigma1 =
        rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)
      words[index] =
        (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 =
        (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }
  return Array.from(hash, (value) => value.toString(16).padStart(8, '0')).join(
    ''
  )
}

function commissionBody(
  value: Prompt2BlogCommissionDraft | Prompt2BlogCommission
): unknown {
  const record = value as unknown as Record<string, unknown>
  const { commission_fingerprint: _ignored, ...body } = record
  return body
}

export function commissionMatchesDraft(
  draft: Prompt2BlogCommissionDraft,
  commission: Prompt2BlogCommission
): boolean {
  return (
    canonicalJson(commissionBody(draft)) ===
    canonicalJson(commissionBody(commission))
  )
}

export function fingerprintCommissionSync(
  draft: Prompt2BlogCommissionDraft | Prompt2BlogCommission
): string {
  return sha256Hex(canonicalJson(commissionBody(draft)))
}

export async function fingerprintCommission(
  draft: Prompt2BlogCommissionDraft
): Promise<string> {
  return fingerprintCommissionSync(draft)
}

export async function approveCommission(
  draft: Prompt2BlogCommissionDraft,
  catalog: Prompt2BlogEditorialOptionsResponse
): Promise<Prompt2BlogCommission> {
  const issues = validateCommissionDraft(draft, catalog)
  if (issues.length) {
    throw new Error(
      `Invalid commission: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join(' ')}`
    )
  }
  return {
    ...draft,
    topic_module_ids: [...(draft.topic_module_ids ?? [])],
    audience: {
      ...draft.audience,
      tags: [...(draft.audience.tags ?? [])]
    },
    scope: {
      ...draft.scope,
      references: draft.scope.references.map((reference) => ({ ...reference }))
    },
    premise: (draft.premise ?? []).map((assumption) => ({ ...assumption })),
    requirements: draft.requirements.map((requirement) => ({
      ...requirement,
      assumption_ids: [...(requirement.assumption_ids ?? [])]
    })),
    exclusions: [...(draft.exclusions ?? [])],
    commission_fingerprint: await fingerprintCommission(draft)
  }
}
