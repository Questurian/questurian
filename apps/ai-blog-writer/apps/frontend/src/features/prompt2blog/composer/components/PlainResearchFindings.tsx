import {
  researchFindingLabel,
  researchQuestionLabel,
  type ResearchFindingCode,
  type ResearchQuestion,
} from '../research-language'

type PlainResearchFinding = {
  code: ResearchFindingCode
  requirement_ids: string[]
  message: string
}

interface PlainResearchFindingsProps {
  findings: readonly PlainResearchFinding[]
  questions: readonly ResearchQuestion[]
}

/** Gate findings in words an operator can act on, without backend ids. */
export function PlainResearchFindings({ findings, questions }: PlainResearchFindingsProps) {
  return (
    <ul className="p2b-import-list">
      {findings.map(finding => {
        const showMessage =
          finding.code !== 'source_gate' &&
          !/^Requirement r\d+ is incomplete\.$/i.test(finding.message)
        const questionLabels = finding.requirement_ids.map(requirementId =>
          researchQuestionLabel(requirementId, questions),
        )
        return (
          <li key={`${finding.code}-${finding.message}`}>
            <strong>{researchFindingLabel(finding.code)}</strong>
            {questionLabels.length > 0 && ` — ${questionLabels.join('; ')}`}
            {showMessage && ` — ${finding.message}`}
          </li>
        )
      })}
    </ul>
  )
}
