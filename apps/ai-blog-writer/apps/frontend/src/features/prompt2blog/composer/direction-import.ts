import {
  PROMPT2BLOG_DIRECTION_OPTION_IDS,
  type Prompt2BlogDirectionOption,
  type Prompt2BlogDirectionResponse,
  type Prompt2BlogEditorialOptionsResponse
} from '../api'
import {
  WORDS_PER_RESEARCH_QUESTION,
  lengthCeilingWords,
  researchQuestionCeilingForLength,
  researchQuestionsForLength,
  todayIso
} from './direction-prompt'

export type DirectionImportIssue = {
  path: string
  message: string
}

export type DirectionImportReview = {
  issues: DirectionImportIssue[]
  /**
   * Things worth saying that must never block the import.
   *
   * A direction can be structurally perfect and still be the wrong article —
   * one research question against a 1400 word target, or a primary subject
   * that names nothing. Refusing it would send the operator back to their own
   * chatbot to fix a prompt this app generated, which is treating a pipeline
   * bug as an operator error. These are said out loud and imported anyway.
   */
  warnings: DirectionWarning[]
  response: Prompt2BlogDirectionResponse | null
}

/**
 * A warning names the direction in the words on the card, not the JSON path.
 *
 * `options[0].requirements` is the schema talking. The operator reads "Direction
 * 1", which is what the radio button beside it says.
 */
export type DirectionWarning = {
  label: string
  message: string
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

/**
 * The premise: what this option assumes without being able to check it.
 *
 * Returns the declared assumption IDs so requirements can be checked against
 * them. A requirement naming an ID no option declared is the shape a model
 * produces when it invents the dependency after the fact.
 */
function validatePremise(
  value: unknown,
  path: string,
  issues: DirectionImportIssue[]
): string[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Must be an array.' })
    return []
  }
  if (!value.length) {
    issues.push({
      path,
      message:
        'Must state at least 1 premise. An option that assumes nothing it ' +
        'cannot check has nothing to declare, which is itself worth saying.'
    })
  }
  const ids: string[] = []
  value.forEach((assumption, index) => {
    const assumptionPath = `${path}[${index}]`
    if (!isObject(assumption)) {
      issues.push({ path: assumptionPath, message: 'Must be an object.' })
      return
    }
    reportUnexpectedKeys(
      assumption,
      ['assumption_id', 'statement'],
      assumptionPath,
      issues
    )
    if (
      requireString(
        assumption.assumption_id,
        `${assumptionPath}.assumption_id`,
        issues
      )
    ) {
      ids.push(assumption.assumption_id)
      if (!/^a[1-9]\d*$/.test(assumption.assumption_id)) {
        issues.push({
          path: `${assumptionPath}.assumption_id`,
          message: 'Must use the stable a1, a2, … format.'
        })
      }
    }
    requireString(assumption.statement, `${assumptionPath}.statement`, issues)
  })
  reportDuplicates(ids, path, 'Assumption IDs', issues)
  return ids
}

function validateRequirements(
  value: unknown,
  path: string,
  declaredAssumptionIds: string[],
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
      ['requirement_id', 'question', 'assumption_ids'],
      requirementPath,
      issues
    )
    validateIdArray(
      requirement.assumption_ids,
      `${requirementPath}.assumption_ids`,
      new Set(declaredAssumptionIds),
      'assumption',
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
      'premise',
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
  const declaredAssumptionIds = validatePremise(
    value.premise,
    `${path}.premise`,
    issues
  )
  validateRequirements(
    value.requirements,
    `${path}.requirements`,
    declaredAssumptionIds,
    issues
  )
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


/**
 * Nouns that describe an article instead of naming its subject.
 *
 * "The current shift underway in Lima's dining scene" passed every structural
 * check and produced an article about nothing nameable. A subject a researcher
 * cannot look up is a subject the writer cannot anchor.
 */
const ABSTRACT_SUBJECT_HEADS = new Set([
  'shift',
  'trend',
  'trends',
  'change',
  'changes',
  'evolution',
  'transformation',
  'rise',
  'boom',
  'surge',
  'state',
  'landscape',
  'scene',
  'culture',
  'movement',
  'moment',
  'situation',
  'dynamic',
  'dynamics',
  'phenomenon',
  'story',
  'picture',
  'outlook'
])

/**
 * What the phrase finally resolves to, not what it mentions along the way.
 *
 * "The current shift underway in Lima's dining scene" names Lima and is still
 * about nothing a researcher can look up, so the presence of a proper noun
 * anywhere is not the test. The last noun is: that one ends in "scene", while
 * "the shift at Central" ends in a restaurant.
 */
function looksAbstract(subject: string): boolean {
  const words = subject
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
  const head = words[words.length - 1]
  if (!head) return false
  return ABSTRACT_SUBJECT_HEADS.has(head.toLocaleLowerCase())
}

/**
 * Words that mean a thing was released into the world on a date.
 *
 * A premise pairing one of these with a year that has not finished is the
 * shape of "the 2026 list is out" — the assumption that cost a whole run,
 * because the ceremony is 1 December 2026 and the direction model had no date
 * and no way to look.
 */
const PUBLICATION_EVENT_WORDS =
  /\b(?:publish(?:ed|es)?|release[ds]?|announce[ds]?|reveal(?:ed|s)?|award(?:ed|s)?|rank(?:ed|ing|ings)?|list(?:ed|s)?|edition|ceremony|report|results?|winners?|season|opens?|opened|launch(?:ed|es)?|takes? effect|in force)\b/i

/**
 * A premise that assumes a dated thing already happened, when the date it
 * names has not run out yet.
 *
 * Deliberately narrow: a year alone is ordinary in travel writing, and a
 * publication word alone says nothing. Only together, and only for this year
 * or later, do they describe something that may still be in the future.
 */
function looksUnverifiedDatedPremise(
  statement: string,
  asOfDate: string
): boolean {
  const currentYear = Number(asOfDate.slice(0, 4))
  if (!Number.isFinite(currentYear)) return false
  const years = statement.match(/\b(20\d{2})\b/g)
  if (!years?.some((year) => Number(year) >= currentYear)) return false
  return PUBLICATION_EVENT_WORDS.test(statement)
}

function looksCompound(question: string): boolean {
  if ((question.match(/\?/g) || []).length > 1) return true
  return /\b(?:and|as well as)\b/i.test(question) && /,/.test(question)
}

function collectDirectionWarnings(
  options: unknown[],
  targetWordCount: number,
  asOfDate: string
): DirectionWarning[] {
  const warnings: DirectionWarning[] = []
  /*
   * Both bounds come from the prompt builder rather than being recomputed
   * here. The warning has to say what the generated prompt asked for; two
   * copies of the arithmetic would eventually disagree, and the operator
   * would be told off for following the instructions this app wrote.
   */
  const needed = targetWordCount ? researchQuestionsForLength(targetWordCount) : 0
  const affordable = researchQuestionCeilingForLength(targetWordCount)
  const ceiling = lengthCeilingWords(targetWordCount)

  options.forEach((option, index) => {
    if (!isObject(option)) return
    const label = `Direction ${index + 1}`
    const requirements = Array.isArray(option.requirements) ? option.requirements : []

    if (needed && requirements.length < needed) {
      warnings.push({
        label,
        message:
          `Asks ${requirements.length} question${requirements.length === 1 ? '' : 's'} ` +
          `for an article of about ${targetWordCount} words. ${needed} or more is ` +
          'what that length needs. Fewer questions means a shorter, thinner article.'
      })
    }

    /*
     * The mirror of the too-few warning, and the same class of failure as the
     * premise checks below: a contradiction visible for free here, otherwise
     * paid for after the run.
     *
     * A commission with six requirements against a 1540 word ceiling carries
     * 2100 words of material. It was over length before a word was written.
     * The real run found out 28 minutes later, when the length check failed
     * and two repair passes were spent trying to cut it back.
     *
     * Advisory, not blocking, exactly like the too-few warning: 350 words a
     * question is an average, and a thin question is genuinely cheaper.
     */
    if (affordable && requirements.length > affordable) {
      const material = requirements.length * WORDS_PER_RESEARCH_QUESTION
      warnings.push({
        label,
        message:
          `Asks ${requirements.length} questions for an article of about ` +
          `${targetWordCount} words. That is roughly ${material} words of ` +
          `material against a ${ceiling} word ceiling, so the article cannot ` +
          `be written to length as commissioned. Cut to about ${affordable} ` +
          'questions, or raise the length.'
      })
    }

    requirements.forEach((requirement, requirementIndex) => {
      if (!isObject(requirement)) return
      const question = requirement.question
      if (typeof question === 'string' && looksCompound(question)) {
        warnings.push({
          label: `${label}, question ${requirementIndex + 1}`,
          message:
            'Asks more than one thing. Splitting it is free now and costs the ' +
            'whole research package later, because one unanswerable half blocks ' +
            'the article.'
        })
      }
    })

    const premise = Array.isArray(option.premise) ? option.premise : []
    premise.forEach((assumption) => {
      if (!isObject(assumption)) return
      const statement = assumption.statement
      if (
        typeof statement === 'string' &&
        looksUnverifiedDatedPremise(statement, asOfDate)
      ) {
        warnings.push({
          label: `${label}, premise`,
          message:
            `"${statement}" assumes something dated has already happened, and ` +
            `today is ${asOfDate}. Nothing in this step can check that. If it ` +
            'turns out not to have happened yet, every question resting on it ' +
            'is unanswerable and the run stops before it starts.'
        })
      }
    })

    /*
     * One premise carrying every question is the failure that motivated all of
     * this: five questions about a ranking, the ranking not yet published, and
     * nothing left to write. The count is what makes it visible here, at the
     * point where picking a different direction is still free.
     */
    const declaredIds = premise
      .filter(isObject)
      .map((assumption) => assumption.assumption_id)
      .filter((id): id is string => typeof id === 'string')
    const dependenciesById = new Map<string, number>()
    requirements.forEach((requirement) => {
      if (!isObject(requirement)) return
      const ids = Array.isArray(requirement.assumption_ids)
        ? requirement.assumption_ids
        : []
      new Set(ids).forEach((id) => {
        if (typeof id !== 'string') return
        dependenciesById.set(id, (dependenciesById.get(id) ?? 0) + 1)
      })
    })
    if (requirements.length > 1) {
      declaredIds.forEach((id) => {
        if (dependenciesById.get(id) !== requirements.length) return
        const statement = premise.find(
          (assumption) =>
            isObject(assumption) && assumption.assumption_id === id
        )
        const text =
          isObject(statement) && typeof statement.statement === 'string'
            ? statement.statement
            : id
        warnings.push({
          label: `${label}, premise`,
          message:
            `All ${requirements.length} questions depend on "${text}". If that ` +
            'turns out to be wrong, the option loses every question at once ' +
            'and there is no partial article to salvage.'
        })
      })
    }

    const subject = option.primary_subject
    if (typeof subject === 'string' && looksAbstract(subject)) {
      warnings.push({
        label: `${label}, what it is about`,
        message:
          `"${subject}" describes an article rather than naming a subject. ` +
          'A place, business, route, neighborhood, document or named event ' +
          'gives research and the writer something to anchor to.'
      })
    }
  })

  return warnings
}

export function reviewDirectionResponseJson(
  raw: string,
  expected: {
    originalTitle: string
    location: string
    targetWordCount?: number
    asOfDate?: string
  },
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
      warnings: [],
      response: null
    }
  }

  if (!isObject(parsed)) {
    return {
      issues: [{ path: 'json', message: 'Must be one JSON object.' }],
      warnings: [],
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

  const warnings = Array.isArray(parsed.options)
    ? collectDirectionWarnings(
        parsed.options,
        expected.targetWordCount ?? 0,
        expected.asOfDate ?? todayIso()
      )
    : []

  return {
    issues,
    warnings,
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
