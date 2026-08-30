import {
  researchFindingLabel,
  researchQuestionLabel,
  type ResearchFindingCode,
  type ResearchQuestion,
} from '../research-language'

type PlainResearchFinding = {
  code: ResearchFindingCode
  requirement_ids: readonly string[]
  message: string
}

interface PlainResearchFindingsProps {
  findings: readonly PlainResearchFinding[]
  questions: readonly ResearchQuestion[]
}

/**
 * The two backend messages that are pure ids are dropped: the source-gate
 * message names the form id and the gate id, and the requirement-gap fallback
 * repeats an id the question label already says in words.
 */
function plainFindingLine(
  finding: PlainResearchFinding,
  questions: readonly ResearchQuestion[],
): { label: string; detail: string } {
  const parts: string[] = []
  if (finding.requirement_ids.length > 0) {
    parts.push(
      finding.requirement_ids
        .map(requirementId => researchQuestionLabel(requirementId, questions))
        .join('; '),
    )
  }
  const messageIsAnId =
    finding.code === 'source_gate' ||
    /^Requirement r\d+ is incomplete\.$/i.test(finding.message)
  if (!messageIsAnId) parts.push(finding.message)
  return {
    label: researchFindingLabel(finding.code),
    detail: parts.map(part => ` — ${part}`).join(''),
  }
}

/** Gate findings in words an operator can act on, without backend ids. */
export function PlainResearchFindings({ findings, questions }: PlainResearchFindingsProps) {
  // Two source-gate findings differ only by the gate id we deliberately hide,
  // so without this they read as the same sentence printed twice.
  const lines = findings.map(finding => plainFindingLine(finding, questions))
  const seen = new Set<string>()

  return (
    <ul className="p2b-import-list">
      {lines
        .filter(line => {
          const key = `${line.label}${line.detail}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .map(line => (
          <li key={`${line.label}${line.detail}`}>
            <strong>{line.label}</strong>
            {line.detail}
          </li>
        ))}
    </ul>
  )
}
