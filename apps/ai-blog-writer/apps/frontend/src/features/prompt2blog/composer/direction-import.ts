import {
  PROMPT2BLOG_DIRECTION_OPTION_IDS,
  type Prompt2BlogDirectionOption,
  type Prompt2BlogDirectionResponse,
  type Prompt2BlogEditorialOptionsResponse
} from '../api'

export type DirectionImportIssue = {
  path: string
  message: string
}

export type DirectionImportReview = {
  issues: DirectionImportIssue[]
  response: Prompt2BlogDirectionResponse | null
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function meaningfulTokens(value: string): Set<string> {
  return new Set(
    normalizedText(value)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter((token) => token && !/^\d+$/.test(token))
  )
}

function textSimilarity(left: string, right: string): number {
  const leftTokens = meaningfulTokens(left)
  const rightTokens = meaningfulTokens(right)
  if (leftTokens.size < 4 || rightTokens.size < 4) {
    return normalizedText(left) === normalizedText(right) ? 1 : 0
  }
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token)
  ).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return intersection / union
}

function reportUnexpectedKeys(
  value: JsonObject,
  keys: readonly string[],
  path: string,
  issues: DirectionImportIssue[]
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
  issues: DirectionImportIssue[]
): value is string {
  if (typeof value !== 'string') {
    issues.push({ path, message: 'Must be a string.' })
    return false
  }
  if (!value.trim()) {
    issues.push({ path, message: 'Must not be empty.' })
    return false
  }
  return true
}

function reportDuplicates(
  values: string[],
  path: string,
  label: string,
  issues: DirectionImportIssue[]
): void {
  if (new Set(values).size !== values.length) {
    issues.push({ path, message: `${label} must be unique.` })
  }
}

function validateIdArray(
  value: unknown,
  path: string,
  allowedIds: Set<string>,
  label: string,
  issues: DirectionImportIssue[],
  maximum?: number
): string[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Must be an array.' })
    return []
  }
  if (maximum !== undefined && value.length > maximum) {
    issues.push({
      path,
      message: `Must contain at most ${maximum} module IDs.`
    })
  }

  const ids: string[] = []
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!requireString(item, itemPath, issues)) return
    ids.push(item)
    if (!allowedIds.has(item)) {
      issues.push({ path: itemPath, message: `Unknown ${label} ID.` })
    }
  })
  reportDuplicates(ids, path, `${label} IDs`, issues)
  return ids
}

function validateAudience(
  value: unknown,
  path: string,
  catalog: Prompt2BlogEditorialOptionsResponse,
  issues: DirectionImportIssue[]
): void {
  if (!isObject(value)) {
    issues.push({ path, message: 'Must be an object.' })
    return
  }
  reportUnexpectedKeys(value, ['primary_reader', 'tags'], path, issues)
  requireString(value.primary_reader, `${path}.primary_reader`, issues)
  validateIdArray(
    value.tags,
    `${path}.tags`,
    new Set(catalog.audience_tags.map((item) => item.id)),
    'audience tag',
    issues
  )
}

function validateScope(
  value: unknown,
  path: string,
  primarySubject: unknown,
  formId: unknown,
  catalog: Prompt2BlogEditorialOptionsResponse,
  issues: DirectionImportIssue[]
): void {
  if (!isObject(value)) {
    issues.push({ path, message: 'Must be an object.' })
    return
  }
  reportUnexpectedKeys(value, ['mode', 'references'], path, issues)

  const allowedModes = new Set<string>(
    catalog.scope_modes.map((item) => item.id)
  )
  const mode = value.mode
  const modeIsString = requireString(mode, `${path}.mode`, issues)
  if (modeIsString && !allowedModes.has(mode)) {
    issues.push({ path: `${path}.mode`, message: 'Unknown scope mode ID.' })
  }

  if (!Array.isArray(value.references)) {
    issues.push({ path: `${path}.references`, message: 'Must be an array.' })
    return
  }
  if (value.references.length === 0) {
    issues.push({
      path: `${path}.references`,
      message: 'Must contain at least 1 reference.'
    })
  }

  const allowedRoles = new Set<string>(
    catalog.reference_roles.map((item) => item.id)
  )
  const names: string[] = []
  let primaryCount = 0
  let primaryName = ''
  let comparatorCount = 0

  value.references.forEach((reference, index) => {
    const referencePath = `${path}.references[${index}]`
    if (!isObject(reference)) {
      issues.push({ path: referencePath, message: 'Must be an object.' })
      return
    }
    reportUnexpectedKeys(reference, ['name', 'role'], referencePath, issues)
    if (requireString(reference.name, `${referencePath}.name`, issues)) {
      names.push(normalizedText(reference.name))
    }
    if (!requireString(reference.role, `${referencePath}.role`, issues)) return
    if (!allowedRoles.has(reference.role)) {
      issues.push({
        path: `${referencePath}.role`,
        message: 'Unknown reference role ID.'
      })
      return
    }
    if (reference.role === 'primary_subject') {
      primaryCount += 1
      if (typeof reference.name === 'string') primaryName = reference.name
    }
    if (reference.role === 'comparator') comparatorCount += 1
  })

  reportDuplicates(names, `${path}.references`, 'Reference names', issues)
  if (primaryCount !== 1) {
    issues.push({
      path,
      message: 'Scope must contain exactly 1 primary_subject reference.'
    })
  } else if (
    typeof primarySubject === 'string' &&
    primaryName !== primarySubject
  ) {
    issues.push({
      path: path.replace(/\.scope$/, '.primary_subject'),
      message: 'Must exactly match the primary_subject reference name.'
    })
  }

  if (value.mode === 'single_subject' && comparatorCount > 0) {
    issues.push({
      path,
      message: 'single_subject scope cannot contain comparators.'
    })
  }
  if (value.mode === 'head_to_head' && comparatorCount < 1) {
    issues.push({
      path,
      message: 'head_to_head scope requires at least 1 comparator.'
    })
  }
  if (value.mode === 'ranked_set' && comparatorCount < 2) {
    issues.push({
      path,
      message: 'ranked_set scope requires at least 2 comparators.'
    })
  }
  if (formId === 'comparison' && value.mode === 'single_subject') {
    issues.push({
      path: `${path}.mode`,
      message: 'Comparison form cannot use single_subject scope.'
    })
  }
  if (value.mode === 'head_to_head' && formId !== 'comparison') {
    issues.push({
      path: path.replace(/\.scope$/, '.form_id'),
      message: 'head_to_head scope requires Comparison form.'
    })
  }
}

function validateRequirements(
  value: unknown,
  path: string,
  issues: DirectionImportIssue[]
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Must be an array.' })
    return
  }
  if (!value.length) {
    issues.push({ path, message: 'Must contain at least 1 requirement.' })
  }
  const ids: string[] = []
  value.forEach((requirement, index) => {
    const requirementPath = `${path}[${index}]`
    if (!isObject(requirement)) {
      issues.push({ path: requirementPath, message: 'Must be an object.' })
      return
    }
    reportUnexpectedKeys(
      requirement,
      ['requirement_id', 'question'],
      requirementPath,
      issues
    )
    if (
      requireString(
        requirement.requirement_id,
        `${requirementPath}.requirement_id`,
        issues
      )
    ) {
      ids.push(requirement.requirement_id)
      if (!/^r[1-9]\d*$/.test(requirement.requirement_id)) {
        issues.push({
          path: `${requirementPath}.requirement_id`,
          message: 'Must use the stable r1, r2, … format.'
        })
      }
    }
    requireString(requirement.question, `${requirementPath}.question`, issues)
  })
  reportDuplicates(ids, path, 'Requirement IDs', issues)
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: DirectionImportIssue[]
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Must be an array.' })
    return
  }
  if (!value.length)
    issues.push({ path, message: 'Must contain at least 1 exclusion.' })
  value.forEach((item, index) =>
    requireString(item, `${path}[${index}]`, issues)
  )
}

function validateOption(
  value: unknown,
  index: number,
  catalog: Prompt2BlogEditorialOptionsResponse,
  issues: DirectionImportIssue[]
): void {
  const path = `options[${index}]`
  if (!isObject(value)) {
    issues.push({ path, message: 'Must be an object.' })
    return
  }
  reportUnexpectedKeys(
    value,
    [
      'option_id',
      'direction',
      'form_id',
      'topic_module_ids',
      'audience',
      'core_reader_question',
      'reader_outcome',
      'primary_subject',
      'scope',
      'requirements',
      'exclusions',
      'rationale'
    ],
    path,
    issues
  )

  const optionIdPath = `${path}.option_id`
  if (requireString(value.option_id, optionIdPath, issues)) {
    const expectedId = PROMPT2BLOG_DIRECTION_OPTION_IDS[index]
    if (value.option_id !== expectedId) {
      issues.push({ path: optionIdPath, message: `Must be "${expectedId}".` })
    }
  }

  requireString(value.direction, `${path}.direction`, issues)
  const formId = value.form_id
  const formIdIsString = requireString(formId, `${path}.form_id`, issues)
  if (
    formIdIsString &&
    !new Set<string>(catalog.forms.map((item) => item.id)).has(formId)
  ) {
    issues.push({
      path: `${path}.form_id`,
      message: 'Unknown article form ID.'
    })
  }
  validateIdArray(
    value.topic_module_ids,
    `${path}.topic_module_ids`,
    new Set(catalog.topic_modules.map((item) => item.id)),
    'topic module',
    issues,
    4
  )
  validateAudience(value.audience, `${path}.audience`, catalog, issues)
  requireString(
    value.core_reader_question,
    `${path}.core_reader_question`,
    issues
  )
  requireString(value.reader_outcome, `${path}.reader_outcome`, issues)
  requireString(value.primary_subject, `${path}.primary_subject`, issues)
  validateScope(
    value.scope,
    `${path}.scope`,
    value.primary_subject,
    value.form_id,
    catalog,
    issues
  )
  validateRequirements(value.requirements, `${path}.requirements`, issues)
  validateStringArray(value.exclusions, `${path}.exclusions`, issues)
  requireString(value.rationale, `${path}.rationale`, issues)
}

function validateDistinctOptions(
  options: unknown[],
  issues: DirectionImportIssue[]
): void {
  for (const field of [
    'direction',
    'core_reader_question',
    'reader_outcome'
  ] as const) {
    const seen = new Set<string>()
    options.forEach((option, index) => {
      if (!isObject(option) || typeof option[field] !== 'string') return
      const normalized = normalizedText(option[field])
      if (seen.has(normalized)) {
        issues.push({
          path: `options[${index}].${field}`,
          message: `Must be materially different from the other option ${field.replace(/_/g, ' ')} values.`
        })
      }
      for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
        const prior = options[priorIndex]
        if (
          isObject(prior) &&
          typeof prior[field] === 'string' &&
          textSimilarity(prior[field], option[field]) >= 0.8
        ) {
          issues.push({
            path: `options[${index}].${field}`,
            message: `Must be materially different from option ${priorIndex + 1}; trivial wording changes do not count.`
          })
          break
        }
      }
      seen.add(normalized)
    })
  }
}

export function reviewDirectionResponseJson(
  raw: string,
  expected: { originalTitle: string; location: string },
  catalog: Prompt2BlogEditorialOptionsResponse
): DirectionImportReview {
  const issues: DirectionImportIssue[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.trim())
  } catch (error) {
    return {
      issues: [
        {
          path: 'json',
          message: `Not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}.`
        }
      ],
      response: null
    }
  }

  if (!isObject(parsed)) {
    return {
      issues: [{ path: 'json', message: 'Must be one JSON object.' }],
      response: null
    }
  }

  reportUnexpectedKeys(
    parsed,
    ['schema_version', 'original_title', 'location', 'options'],
    '',
    issues
  )
  if (parsed.schema_version !== 3) {
    issues.push({ path: 'schema_version', message: 'Must equal 3.' })
  }
  if (requireString(parsed.original_title, 'original_title', issues)) {
    if (parsed.original_title !== expected.originalTitle) {
      issues.push({
        path: 'original_title',
        message: 'Must exactly match the app-owned title.'
      })
    }
  }
  if (requireString(parsed.location, 'location', issues)) {
    if (parsed.location !== expected.location) {
      issues.push({
        path: 'location',
        message: 'Must exactly match the app-owned location.'
      })
    }
  }

  if (!Array.isArray(parsed.options)) {
    issues.push({ path: 'options', message: 'Must be an array.' })
  } else {
    if (parsed.options.length !== 3) {
      issues.push({
        path: 'options',
        message: 'Must contain exactly 3 options.'
      })
    }
    parsed.options.forEach((option, index) =>
      validateOption(option, index, catalog, issues)
    )
    validateDistinctOptions(parsed.options, issues)
  }

  return {
    issues,
    response: issues.length ? null : (parsed as Prompt2BlogDirectionResponse)
  }
}

export function validateDirectionOption(
  option: Prompt2BlogDirectionOption,
  catalog: Prompt2BlogEditorialOptionsResponse
): DirectionImportIssue[] {
  const issues: DirectionImportIssue[] = []
  validateOption(
    option,
    PROMPT2BLOG_DIRECTION_OPTION_IDS.indexOf(option.option_id),
    catalog,
    issues
  )
  return issues
}
