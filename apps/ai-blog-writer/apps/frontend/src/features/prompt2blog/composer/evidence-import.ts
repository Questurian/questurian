import type {
  Prompt2BlogCommission,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogEvidencePackage,
  Prompt2BlogEvidenceSource,
  Prompt2BlogSourceRequirement
} from '../api'

export type EvidenceImportIssue = {
  path: string
  message: string
}

export type EvidenceReadinessFinding = {
  code:
    | 'requirement_gap'
    | 'unresolved_conflict'
    | 'source_gate'
    | 'nothing_answered'
  requirement_ids: string[]
  message: string
}

export type EvidenceImportValidation = {
  issues: EvidenceImportIssue[]
  evidencePackage: Prompt2BlogEvidencePackage | null
}

export type EvidenceImportReview = {
  issues: EvidenceImportIssue[]
  readinessFindings: EvidenceReadinessFinding[]
  evidencePackage: Prompt2BlogEvidencePackage | null
}

type JsonObject = Record<string, unknown>

const SOURCE_TYPES = new Set([
  'official',
  'reporting',
  'specialist',
  'firsthand',
  'other'
])
const MATERIAL_TYPES = new Set([
  'web',
  'report',
  'transcript',
  'interview-responses',
  'first-person-notes',
  'evaluation-notes',
  'other'
])
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low'])
const REQUIREMENT_STATUSES = new Set([
  'supported',
  'partial',
  'missing',
  'unpublished'
])

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reportExactKeys(
  value: JsonObject,
  keys: readonly string[],
  path: string,
  issues: EvidenceImportIssue[]
): void {
  const expected = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      issues.push({
        path: path ? `${path}.${key}` : key,
        message: 'Unexpected key.'
      })
    }
  }
  for (const key of keys) {
    if (!(key in value)) {
      issues.push({
        path: path ? `${path}.${key}` : key,
        message: 'Missing required key.'
      })
    }
  }
}

function requireString(
  value: unknown,
  path: string,
  issues: EvidenceImportIssue[],
  nullable?: false
): value is string
function requireString(
  value: unknown,
  path: string,
  issues: EvidenceImportIssue[],
  nullable: true
): value is string | null
function requireString(
  value: unknown,
  path: string,
  issues: EvidenceImportIssue[],
  nullable = false
): value is string | null {
  if (nullable && value === null) return true
  if (typeof value !== 'string') {
    issues.push({
      path,
      message: nullable ? 'Must be a string or null.' : 'Must be a string.'
    })
    return false
  }
  if (!value.trim()) {
    issues.push({ path, message: 'Must not be empty.' })
    return false
  }
  return true
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function validateDate(
  value: unknown,
  path: string,
  issues: EvidenceImportIssue[],
  nullable: boolean
): void {
  if (nullable && value === null) return
  if (typeof value !== 'string' || !isRealDate(value)) {
    issues.push({
      path,
      message: `Must be a real YYYY-MM-DD date${nullable ? ' or null' : ''}.`
    })
  }
}

function validateUrl(
  value: unknown,
  path: string,
  issues: EvidenceImportIssue[]
): boolean {
  if (value === null) return true
  if (typeof value !== 'string') {
    issues.push({ path, message: 'Must be an HTTP(S) URL or null.' })
    return false
  }
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return true
  } catch {
    // Fall through to the shared issue below.
  }
  issues.push({ path, message: 'Must be an HTTP(S) URL or null.' })
  return false
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: EvidenceImportIssue[],
  options: { minimum?: number; unique?: boolean } = {}
): string[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Must be an array.' })
    return []
  }
  if (value.length < (options.minimum ?? 0)) {
    issues.push({
      path,
      message: `Must contain at least ${options.minimum} item(s).`
    })
  }
  const result: string[] = []
  value.forEach((item, index) => {
    if (requireString(item, `${path}[${index}]`, issues)) result.push(item)
  })
  if (options.unique && new Set(result).size !== result.length) {
    issues.push({ path, message: 'Values must be unique.' })
  }
  return result
}

function reportDuplicateIds(
  ids: string[],
  path: string,
  issues: EvidenceImportIssue[]
): void {
  if (new Set(ids).size !== ids.length) {
    issues.push({ path, message: 'IDs must be unique.' })
  }
}

function validateStableId(
  value: unknown,
  path: string,
  prefix: 's' | 'c' | 'x' | 'g',
  issues: EvidenceImportIssue[]
): value is string {
  if (!requireString(value, path, issues)) return false
  if (!new RegExp(`^${prefix}[1-9]\\d*$`).test(value)) {
    issues.push({
      path,
      message: `Must use the stable ${prefix}1, ${prefix}2, … format.`
    })
    return false
  }
  return true
}

function validateSource(
  value: unknown,
  index: number,
  issues: EvidenceImportIssue[]
): string | null {
  const path = `sources[${index}]`
  if (!isObject(value)) {
    issues.push({ path, message: 'Must be an object.' })
    return null
  }
  reportExactKeys(
    value,
    [
      'source_id',
      'title',
      'publisher',
      'url',
      'published_at',
      'retrieved_at',
      'source_type',
      'material_type',
      'notes'
    ],
    path,
    issues
  )
  const idIsValid = validateStableId(
    value.source_id,
    `${path}.source_id`,
    's',
    issues
  )
  requireString(value.title, `${path}.title`, issues)
  requireString(value.publisher, `${path}.publisher`, issues, true)
  validateUrl(value.url, `${path}.url`, issues)
  validateDate(value.published_at, `${path}.published_at`, issues, true)
  validateDate(value.retrieved_at, `${path}.retrieved_at`, issues, false)
  if (
    typeof value.source_type !== 'string' ||
    !SOURCE_TYPES.has(value.source_type)
  ) {
    issues.push({
      path: `${path}.source_type`,
      message: 'Unknown source type.'
    })
  }
  if (
    typeof value.material_type !== 'string' ||
    !MATERIAL_TYPES.has(value.material_type)
  ) {
    issues.push({
      path: `${path}.material_type`,
      message: 'Unknown material type.'
    })
  }
  validateStringArray(value.notes, `${path}.notes`, issues, { minimum: 1 })
  if (
    (value.material_type === 'web' || value.material_type === 'report') &&
    (typeof value.publisher !== 'string' ||
      !value.publisher.trim() ||
      typeof value.url !== 'string')
  ) {
    issues.push({
      path,
      message: 'Web and report sources require publisher and URL metadata.'
    })
  }
  return idIsValid && typeof value.source_id === 'string'
    ? value.source_id
    : null
}

type ClaimLinks = {
  claimId: string
  sourceIds: string[]
  requirementIds: string[]
}

function validateClaim(
  value: unknown,
  index: number,
  issues: EvidenceImportIssue[]
): ClaimLinks | null {
  const path = `claims[${index}]`
  if (!isObject(value)) {
    issues.push({ path, message: 'Must be an object.' })
    return null
  }
  reportExactKeys(
    value,
    [
      'claim_id',
      'text',
      'source_ids',
      'requirement_ids',
      'as_of',
      'confidence'
    ],
    path,
    issues
  )
  const idIsValid = validateStableId(
    value.claim_id,
    `${path}.claim_id`,
    'c',
    issues
  )
  requireString(value.text, `${path}.text`, issues)
  const sourceIds = validateStringArray(
    value.source_ids,
    `${path}.source_ids`,
    issues,
    {
      minimum: 1,
      unique: true
    }
  )
  const requirementIds = validateStringArray(
    value.requirement_ids,
    `${path}.requirement_ids`,
    issues,
    { minimum: 1, unique: true }
  )
  validateDate(value.as_of, `${path}.as_of`, issues, true)
  if (
    typeof value.confidence !== 'string' ||
    !CONFIDENCE_LEVELS.has(value.confidence)
  ) {
    issues.push({
      path: `${path}.confidence`,
      message: 'Unknown confidence level.'
    })
  }
  return idIsValid && typeof value.claim_id === 'string'
    ? { claimId: value.claim_id, sourceIds, requirementIds }
    : null
}

type RequirementLinks = {
  requirementId: string
  status: string
  claimIds: string[]
  gap: string
}

function validateRequirement(
  value: unknown,
  index: number,
  issues: EvidenceImportIssue[]
): RequirementLinks | null {
  const path = `requirements[${index}]`
  if (!isObject(value)) {
    issues.push({ path, message: 'Must be an object.' })
    return null
  }
  reportExactKeys(
    value,
    ['requirement_id', 'status', 'claim_ids', 'gap'],
    path,
    issues
  )
  const idIsValid = requireString(
    value.requirement_id,
    `${path}.requirement_id`,
    issues
  )
  const status = typeof value.status === 'string' ? value.status : ''
  if (!REQUIREMENT_STATUSES.has(status)) {
    issues.push({
      path: `${path}.status`,
      message: 'Unknown requirement status.'
    })
  }
  const claimIds = validateStringArray(
    value.claim_ids,
    `${path}.claim_ids`,
    issues,
    {
      unique: true
    }
  )
  if (typeof value.gap !== 'string') {
    issues.push({ path: `${path}.gap`, message: 'Must be a string.' })
  }
  const gap = typeof value.gap === 'string' ? value.gap : ''
  if (status === 'supported' && (claimIds.length === 0 || gap.trim())) {
    issues.push({
      path,
      message: 'Supported requirements need claims and an empty gap.'
    })
  }
  if (status === 'partial' && !gap.trim()) {
    issues.push({
      path,
      message: 'Partial requirements need a non-empty gap.'
    })
  }
  if (status === 'missing' && (claimIds.length > 0 || !gap.trim())) {
    issues.push({
      path,
      message: 'Missing requirements need no claims and a non-empty gap.'
    })
  }
  // The gap is what makes an unpublished verdict checkable: it has to name the
  // authorities, documents and dates that were searched. Claims are allowed and
  // wanted, because a source stating the limit of what it measures is the best
  // evidence that the figure is unpublished rather than merely unfound.
  if (status === 'unpublished' && !gap.trim()) {
    issues.push({
      path,
      message:
        'Unpublished requirements need a non-empty gap naming what was checked.'
    })
  }
  return idIsValid && typeof value.requirement_id === 'string'
    ? { requirementId: value.requirement_id, status, claimIds, gap }
    : null
}

type ConflictLinks = {
  claimIds: string[]
  resolution: string | null
}

function validateConflict(
  value: unknown,
  index: number,
  issues: EvidenceImportIssue[]
): { id: string; links: ConflictLinks } | null {
  const path = `conflicts[${index}]`
  if (!isObject(value)) {
    issues.push({ path, message: 'Must be an object.' })
    return null
  }
  reportExactKeys(
    value,
    ['conflict_id', 'claim_ids', 'summary', 'resolution'],
    path,
    issues
  )
  const idIsValid = validateStableId(
    value.conflict_id,
    `${path}.conflict_id`,
    'x',
    issues
  )
  const claimIds = validateStringArray(
    value.claim_ids,
    `${path}.claim_ids`,
    issues,
    {
      minimum: 2,
      unique: true
    }
  )
  requireString(value.summary, `${path}.summary`, issues)
  if (value.resolution !== null && typeof value.resolution !== 'string') {
    issues.push({
      path: `${path}.resolution`,
      message: 'Must be a string or null.'
    })
  }
  return idIsValid && typeof value.conflict_id === 'string'
    ? {
        id: value.conflict_id,
        links: {
          claimIds,
          resolution:
            typeof value.resolution === 'string' ? value.resolution : null
        }
      }
    : null
}

function validateGap(
  value: unknown,
  index: number,
  issues: EvidenceImportIssue[]
): { id: string; requirementIds: string[] } | null {
  const path = `gaps[${index}]`
  if (!isObject(value)) {
    issues.push({ path, message: 'Must be an object.' })
    return null
  }
  reportExactKeys(value, ['gap_id', 'requirement_ids', 'summary'], path, issues)
  const idIsValid = validateStableId(
    value.gap_id,
    `${path}.gap_id`,
    'g',
    issues
  )
  const requirementIds = validateStringArray(
    value.requirement_ids,
    `${path}.requirement_ids`,
    issues,
    { minimum: 1, unique: true }
  )
  requireString(value.summary, `${path}.summary`, issues)
  return idIsValid && typeof value.gap_id === 'string'
    ? { id: value.gap_id, requirementIds }
    : null
}

function reportUnknownLinks(
  ids: string[],
  allowed: Set<string>,
  path: string,
  label: string,
  issues: EvidenceImportIssue[]
): void {
  ids.forEach((id, index) => {
    if (!allowed.has(id)) {
      issues.push({
        path: `${path}[${index}]`,
        message: `Unknown ${label} ID.`
      })
    }
  })
}

export function evidenceSatisfiesSourceRequirement(
  requirement: Prompt2BlogSourceRequirement,
  sources: readonly Prompt2BlogEvidenceSource[]
): boolean {
  if (requirement === 'reported-people-scenes-quotations') {
    const hasAttributableVoice = sources.some(
      (source) =>
        source.material_type === 'transcript' ||
        source.material_type === 'interview-responses'
    )
    const hasDocumentedScene = sources.some(
      (source) =>
        source.source_type === 'reporting' || source.source_type === 'firsthand'
    )
    return hasAttributableVoice && hasDocumentedScene
  }
  return sources.some((source) => {
    if (requirement === 'attributable-responses') {
      return (
        source.material_type === 'transcript' ||
        source.material_type === 'interview-responses'
      )
    }
    if (requirement === 'first-person-material') {
      return source.material_type === 'first-person-notes'
    }
    return (
      source.material_type === 'evaluation-notes' ||
      source.source_type === 'firsthand'
    )
  })
}

function sourceGateFindings(
  evidencePackage: Prompt2BlogEvidencePackage,
  commission: Prompt2BlogCommission,
  catalog: Prompt2BlogEditorialOptionsResponse
): EvidenceReadinessFinding[] {
  const gates =
    catalog.forms.find((form) => form.id === commission.form_id)
      ?.source_requirements ?? []
  const sources = evidencePackage.sources ?? []
  return gates
    .filter((gate) => !evidenceSatisfiesSourceRequirement(gate, sources))
    .map((gate) => ({
      code: 'source_gate' as const,
      requirement_ids: [],
      message: `The ${commission.form_id} form still needs ${gate}.`
    }))
}

function buildReadinessFindings(
  evidencePackage: Prompt2BlogEvidencePackage,
  commission: Prompt2BlogCommission,
  catalog: Prompt2BlogEditorialOptionsResponse
): EvidenceReadinessFinding[] {
  const findings: EvidenceReadinessFinding[] = []
  for (const requirement of evidencePackage.requirements) {
    // `unpublished` is a reported result, not a gap to chase. More rounds
    // return the same sentence, so it must not hold the run.
    if (requirement.status === 'partial' || requirement.status === 'missing') {
      findings.push({
        code: 'requirement_gap',
        requirement_ids: [requirement.requirement_id],
        message:
          requirement.gap ||
          `Requirement ${requirement.requirement_id} is incomplete.`
      })
    }
  }
  const claims = new Map(
    (evidencePackage.claims ?? []).map((claim) => [claim.claim_id, claim])
  )
  for (const conflict of evidencePackage.conflicts ?? []) {
    if (conflict.resolution?.trim()) continue
    const requirementIds = [
      ...new Set(
        conflict.claim_ids.flatMap(
          (claimId) => claims.get(claimId)?.requirement_ids ?? []
        )
      )
    ]
    findings.push({
      code: 'unresolved_conflict',
      requirement_ids: requirementIds,
      message: conflict.summary
    })
  }
  // Backstop against a research desk that escapes the gate by declaring every
  // question unpublished: an article where nothing at all was findable has
  // nothing to write. Mirrors the backend's `nothing_answered` finding.
  if (
    evidencePackage.requirements.length > 0 &&
    !evidencePackage.requirements.some(
      (requirement) => requirement.status === 'supported'
    )
  ) {
    findings.push({
      code: 'nothing_answered',
      requirement_ids: evidencePackage.requirements.map(
        (requirement) => requirement.requirement_id
      ),
      message: 'No question was answered, so there is nothing to write from.'
    })
  }
  findings.push(...sourceGateFindings(evidencePackage, commission, catalog))
  return findings
}

/**
 * Deterministic structural validation of an already-parsed evidence package
 * against one approved commission. Catalog-free on purpose so stored evidence
 * can be re-validated before the editorial catalog has loaded.
 */
export function validateEvidencePackageValue(
  parsed: unknown,
  commission: Prompt2BlogCommission
): EvidenceImportValidation {
  if (!isObject(parsed)) {
    return {
      issues: [{ path: 'json', message: 'Must be one bare JSON object.' }],
      evidencePackage: null
    }
  }

  const issues: EvidenceImportIssue[] = []
  reportExactKeys(
    parsed,
    [
      'schema_version',
      'commission_fingerprint',
      'sources',
      'claims',
      'requirements',
      'conflicts',
      'gaps'
    ],
    '',
    issues
  )
  if (parsed.schema_version !== 3) {
    issues.push({ path: 'schema_version', message: 'Must equal 3.' })
  }
  if (parsed.commission_fingerprint !== commission.commission_fingerprint) {
    issues.push({
      path: 'commission_fingerprint',
      message: 'Must match the currently approved commission.'
    })
  }

  const sources = Array.isArray(parsed.sources) ? parsed.sources : []
  if (!Array.isArray(parsed.sources))
    issues.push({ path: 'sources', message: 'Must be an array.' })
  const sourceIds = sources
    .map((source, index) => validateSource(source, index, issues))
    .filter(Boolean) as string[]
  reportDuplicateIds(sourceIds, 'sources', issues)

  const claims = Array.isArray(parsed.claims) ? parsed.claims : []
  if (!Array.isArray(parsed.claims))
    issues.push({ path: 'claims', message: 'Must be an array.' })
  const claimLinks = claims
    .map((claim, index) => validateClaim(claim, index, issues))
    .filter(Boolean) as ClaimLinks[]
  reportDuplicateIds(
    claimLinks.map((claim) => claim.claimId),
    'claims',
    issues
  )

  const requirements = Array.isArray(parsed.requirements)
    ? parsed.requirements
    : []
  if (!Array.isArray(parsed.requirements)) {
    issues.push({ path: 'requirements', message: 'Must be an array.' })
  }
  const requirementLinks = requirements
    .map((requirement, index) =>
      validateRequirement(requirement, index, issues)
    )
    .filter(Boolean) as RequirementLinks[]
  reportDuplicateIds(
    requirementLinks.map((requirement) => requirement.requirementId),
    'requirements',
    issues
  )

  const conflicts = Array.isArray(parsed.conflicts) ? parsed.conflicts : []
  if (!Array.isArray(parsed.conflicts))
    issues.push({ path: 'conflicts', message: 'Must be an array.' })
  const conflictLinks = conflicts
    .map((conflict, index) => validateConflict(conflict, index, issues))
    .filter(Boolean) as Array<{ id: string; links: ConflictLinks }>
  reportDuplicateIds(
    conflictLinks.map((conflict) => conflict.id),
    'conflicts',
    issues
  )

  const gaps = Array.isArray(parsed.gaps) ? parsed.gaps : []
  if (!Array.isArray(parsed.gaps))
    issues.push({ path: 'gaps', message: 'Must be an array.' })
  const gapLinks = gaps
    .map((gap, index) => validateGap(gap, index, issues))
    .filter(Boolean) as Array<{
    id: string
    requirementIds: string[]
  }>
  reportDuplicateIds(
    gapLinks.map((gap) => gap.id),
    'gaps',
    issues
  )

  const knownSourceIds = new Set(sourceIds)
  const knownClaimIds = new Set(claimLinks.map((claim) => claim.claimId))
  const commissionRequirementIds = new Set(
    commission.requirements.map((requirement) => requirement.requirement_id)
  )
  const evidenceRequirementIds = new Set(
    requirementLinks.map((requirement) => requirement.requirementId)
  )
  if (
    commissionRequirementIds.size !== evidenceRequirementIds.size ||
    [...commissionRequirementIds].some((id) => !evidenceRequirementIds.has(id))
  ) {
    issues.push({
      path: 'requirements',
      message: 'Requirement IDs must exactly match the approved commission.'
    })
  }

  claimLinks.forEach((claim, index) => {
    reportUnknownLinks(
      claim.sourceIds,
      knownSourceIds,
      `claims[${index}].source_ids`,
      'source',
      issues
    )
    reportUnknownLinks(
      claim.requirementIds,
      commissionRequirementIds,
      `claims[${index}].requirement_ids`,
      'requirement',
      issues
    )
  })
  requirementLinks.forEach((requirement, index) => {
    reportUnknownLinks(
      requirement.claimIds,
      knownClaimIds,
      `requirements[${index}].claim_ids`,
      'claim',
      issues
    )
    requirement.claimIds.forEach((claimId) => {
      const claim = claimLinks.find((item) => item.claimId === claimId)
      if (claim && !claim.requirementIds.includes(requirement.requirementId)) {
        issues.push({
          path: `requirements[${index}].claim_ids`,
          message: `Claim ${claimId} does not link back to ${requirement.requirementId}.`
        })
      }
    })
  })
  claimLinks.forEach((claim, index) => {
    claim.requirementIds.forEach((requirementId) => {
      const requirement = requirementLinks.find(
        (item) => item.requirementId === requirementId
      )
      if (requirement && !requirement.claimIds.includes(claim.claimId)) {
        issues.push({
          path: `claims[${index}].requirement_ids`,
          message: `Requirement ${requirementId} does not link back to ${claim.claimId}.`
        })
      }
    })
  })
  conflictLinks.forEach((conflict, index) =>
    reportUnknownLinks(
      conflict.links.claimIds,
      knownClaimIds,
      `conflicts[${index}].claim_ids`,
      'claim',
      issues
    )
  )
  gapLinks.forEach((gap, index) =>
    reportUnknownLinks(
      gap.requirementIds,
      commissionRequirementIds,
      `gaps[${index}].requirement_ids`,
      'requirement',
      issues
    )
  )

  if (issues.length) return { issues, evidencePackage: null }
  return {
    issues: [],
    evidencePackage: parsed as unknown as Prompt2BlogEvidencePackage
  }
}

/** Recomputes readiness findings for evidence that already validated. */
export function evidenceReadinessFindings(
  evidencePackage: Prompt2BlogEvidencePackage,
  commission: Prompt2BlogCommission,
  catalog: Prompt2BlogEditorialOptionsResponse
): EvidenceReadinessFinding[] {
  return buildReadinessFindings(evidencePackage, commission, catalog)
}

export function reviewEvidencePackageJson(
  raw: string,
  commission: Prompt2BlogCommission,
  catalog: Prompt2BlogEditorialOptionsResponse
): EvidenceImportReview {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      issues: [
        {
          path: 'json',
          message: 'Must be one bare JSON object without prose or fences.'
        }
      ],
      readinessFindings: [],
      evidencePackage: null
    }
  }

  const { issues, evidencePackage } = validateEvidencePackageValue(
    parsed,
    commission
  )
  if (!evidencePackage) return { issues, readinessFindings: [], evidencePackage }
  return {
    issues: [],
    readinessFindings: buildReadinessFindings(
      evidencePackage,
      commission,
      catalog
    ),
    evidencePackage
  }
}
