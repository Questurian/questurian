export type ResearchFindingCode =
  | 'requirement_gap'
  | 'unresolved_conflict'
  | 'source_gate'
  | 'nothing_answered'
  | 'premise_refuted'
  | 'premise_unverified'

export type ResearchQuestion = {
  requirement_id: string
  question: string
}

const FINDING_LABELS: Record<ResearchFindingCode, string> = {
  requirement_gap: 'Still unanswered',
  unresolved_conflict: 'Two sources disagree',
  source_gate: 'This kind of article needs a first-hand source',
  nothing_answered: 'Nothing came back answered',
  premise_refuted: 'The article was built on something that is not true',
  premise_unverified: 'Something the article assumes could not be checked',
}

/**
 * Falls back rather than rendering an empty label: a finding code this build
 * has never heard of still has to say that it stopped the run.
 */
export function researchFindingLabel(code: string): string {
  return FINDING_LABELS[code as ResearchFindingCode] ?? 'Still needs attention'
}

const STATUS_LABELS: Record<string, string> = {
  supported: 'Answered',
  partial: 'Partly answered',
  missing: 'Still unanswered',
  unpublished: 'Nobody publishes this — it was checked',
}

/**
 * `partial` and `missing` both block the run, but they are different jobs for
 * the operator — one answer needs finishing, the other needs starting — so
 * they keep different words. `unpublished` blocks nothing: it is a result, and
 * the words have to say so or the operator will go looking for the answer
 * again.
 */
export function researchStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

export function researchQuestionLabel(
  requirementId: string,
  questions: readonly ResearchQuestion[]
): string {
  const question = questions.find(item => item.requirement_id === requirementId)?.question
  const number = /^r(\d+)$/i.exec(requirementId)?.[1]

  if (number && question) return `Question ${number}: ${question}`
  if (question) return `Question: ${question}`
  if (number) return `Question ${number}`
  return 'Article question'
}

export function researchNotReadyMessage(questionCount: number): string {
  if (questionCount === 1) {
    return 'Not ready yet — 1 question still needs an answer. Nothing ran and nothing was charged.'
  }
  if (questionCount > 1) {
    return `Not ready yet — ${questionCount} questions still need answers. Nothing ran and nothing was charged.`
  }
  return 'Not ready yet — the research still needs attention. Nothing ran and nothing was charged.'
}

export function plainEvidenceIssue(path: string, message: string): {
  label: string | null
  message: string
} {
  if (path.split('.').includes('commission_fingerprint')) {
    return {
      label: null,
      message: 'This research belongs to a different commission.',
    }
  }
  return { label: path, message }
}

/**
 * The all-clear line. A question settled as unpublished is not an answer, and
 * saying "every question is answered" over the top of one is the kind of
 * sentence that sends an operator back to research something that does not
 * exist.
 */
export function researchReadyMessage(unpublishedCount: number): string {
  const clean =
    'Every question is answered, and nothing is left disagreeing or missing a first-hand source.'
  if (unpublishedCount === 1) {
    return 'Every question is settled. One has no published answer anywhere, so the article will be written around it.'
  }
  if (unpublishedCount > 1) {
    return `Every question is settled. ${unpublishedCount} have no published answer anywhere, so the article will be written around them.`
  }
  return clean
}

/**
 * What is attached, counted in words a reader of the page already owns.
 *
 * `sources` and `claims` are schema nouns, and "1 sources" was on screen. The
 * operator does not have the schema and should not need it to read a count.
 */
export function attachedResearchSummary(
  sourceCount: number,
  factCount: number
): string {
  const sources = `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`
  const facts = `${factCount} ${factCount === 1 ? 'fact' : 'facts'}`
  return `${facts} from ${sources}.`
}
