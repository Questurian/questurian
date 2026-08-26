export type ResearchFindingCode =
  | 'requirement_gap'
  | 'unresolved_conflict'
  | 'source_gate'

export type ResearchQuestion = {
  requirement_id: string
  question: string
}

const FINDING_LABELS: Record<ResearchFindingCode, string> = {
  requirement_gap: 'Still unanswered',
  unresolved_conflict: 'Two sources disagree',
  source_gate: 'This kind of article needs a first-hand source',
}

export function researchFindingLabel(code: ResearchFindingCode): string {
  return FINDING_LABELS[code]
}

const STATUS_LABELS: Record<string, string> = {
  supported: 'Answered',
  partial: 'Partly answered',
  missing: 'Still unanswered',
}

/**
 * `partial` and `missing` both block the run, but they are different jobs for
 * the operator — one answer needs finishing, the other needs starting — so
 * they keep different words.
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
