import type {
  Prompt2BlogCommission,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogSourceRequirement
} from '../api'

const SOURCE_GATE_GUIDANCE: Record<Prompt2BlogSourceRequirement, string> = {
  'reported-people-scenes-quotations':
    'Require attributable people, documented scenes, and exact supported quotations.',
  'attributable-responses':
    'Require a transcript, recording record, or written interview responses attributable to the named speaker.',
  'first-person-material':
    'Require supplied first-person notes, journals, recordings, or equivalent lived-experience material.',
  'documented-evaluation':
    'Require firsthand notes or a documented evaluation record naming evaluator, date, method, conditions, and limitations.'
}

function activeResearchGuidance(
  commission: Prompt2BlogCommission,
  catalog: Prompt2BlogEditorialOptionsResponse
): { form: string; modules: string; sourceGates: string } {
  const form = catalog.forms.find((option) => option.id === commission.form_id)
  if (!form) throw new Error(`Unknown commission form "${commission.form_id}".`)

  const activeModules = (commission.topic_module_ids ?? []).map((moduleId) => {
    const module = catalog.topic_modules.find(
      (option) => option.id === moduleId
    )
    if (!module)
      throw new Error(`Unknown commission topic module "${moduleId}".`)
    return `- ${module.id} (${module.label}) — ${module.description.replace(/\s+/g, ' ').trim()}`
  })

  const sourceGates = form.source_requirements.map(
    (requirement) => `- ${requirement} — ${SOURCE_GATE_GUIDANCE[requirement]}`
  )

  return {
    form: `${form.id} (${form.label}) — ${form.description.replace(/\s+/g, ' ').trim()}`,
    modules: activeModules.length ? activeModules.join('\n') : '- None.',
    sourceGates: sourceGates.length ? sourceGates.join('\n') : '- None.'
  }
}

/**
 * Requirement status and claim confidence answer different questions, and a
 * research desk that conflates them stalls on a question it has in fact
 * answered. The real run that motivated this block held a requirement at
 * `partial` for three rounds because the issuing authority's own site blocks
 * automated retrieval, even though several independent sources agreed on the
 * figure. An unreachable primary source is a confidence reservation, not an
 * unanswered question.
 *
 * Shared verbatim with the follow-up prompt and mirrored in the backend's
 * `build_follow_up_research_prompt`; all three must say the same thing.
 */
export const REQUIREMENT_STATUS_RULES = `REQUIREMENT STATUS VERSUS CLAIM CONFIDENCE
These record two different things. Never conflate them.
- status describes the QUESTION. supported means linked claims answer the requirement's question; partial means part of that question is still unanswered; missing means none of it is answered.
- confidence describes the ANSWER. high, medium, or low records how well corroborated that answer is.
- An answer you found and corroborated stays supported even when you could not reach the ideal primary source, the publisher blocks automated retrieval, or you would have preferred more evidence. Record that reservation as claim confidence medium or low and as a source note. Never downgrade the requirement to partial for it.
- Reserve partial and missing for a genuinely unanswered question. Do not pad weak evidence, infer missing facts, or mark a requirement supported without linked claims.`

/** Exact bare response shape shared by initial and follow-up research prompts. */
export function formatEvidencePackageContract(fingerprint: string): string {
  return `{
  "schema_version": 3,
  "commission_fingerprint": ${JSON.stringify(fingerprint)},
  "sources": [
    {
      "source_id": "s1",
      "title": "Source title",
      "publisher": "Publisher",
      "url": "https://example.com",
      "published_at": "YYYY-MM-DD",
      "retrieved_at": "YYYY-MM-DD",
      "source_type": "official|reporting|specialist|firsthand|other",
      "material_type": "web|report|transcript|interview-responses|first-person-notes|evaluation-notes|other",
      "notes": ["Exact useful fact, observation, quotation, or qualification"]
    }
  ],
  "claims": [
    {
      "claim_id": "c1",
      "text": "One precise supported claim",
      "source_ids": ["s1"],
      "requirement_ids": ["r1"],
      "as_of": "YYYY-MM-DD or null",
      "confidence": "high|medium|low"
    }
  ],
  "requirements": [
    {
      "requirement_id": "r1",
      "status": "supported|partial|missing",
      "claim_ids": ["c1"],
      "gap": "Empty only when the question is answered; otherwise say exactly which part of the question is still unanswered"
    }
  ],
  "conflicts": [
    {
      "conflict_id": "x1",
      "claim_ids": ["c1", "c2"],
      "summary": "What conflicts",
      "resolution": "Resolution or null"
    }
  ],
  "gaps": [
    {
      "gap_id": "g1",
      "requirement_ids": ["r1"],
      "summary": "Exact unresolved research work"
    }
  ]
}`
}

/** Builds the external-research prompt without granting the chatbot editorial authority. */
export function buildResearchPrompt(
  commission: Prompt2BlogCommission,
  catalog: Prompt2BlogEditorialOptionsResponse
): string {
  const guidance = activeResearchGuidance(commission, catalog)

  return `You are a research desk gathering structured evidence for an already approved travel commission.

AUTHORITY LOCK
The commission is read-only authority. Research it; never rewrite or reinterpret it.
- Keep commission_fingerprint exactly as supplied.
- Do not change the form, primary subject, scope, reference roles, requirements, exclusions, audience, title, location, or approved direction.
- Do not add a comparator, promote a context-only reference, or broaden the article into a comparison.
- Do not write the article, an outline, or editorial recommendations.

LOCKED COMMISSION
${JSON.stringify(commission, null, 2)}

ACTIVE ARTICLE FORM
${guidance.form}

ACTIVE FORM SOURCE GATES
${guidance.sourceGates}
If a source gate cannot be met, leave affected requirements partial or missing and describe the gap. Never simulate interviews, firsthand experience, evaluation, scenes, or quotations.

ACTIVE TOPIC MODULE METADATA
${guidance.modules}
Use these modules to focus source selection and factual treatment. Do not research inactive modules merely because they appear generally relevant.

RESEARCH DISCIPLINE
- Answer only the locked requirement questions.
- Prefer primary, official, attributable, current sources; preserve publisher, URL, dates, source type, material type, and useful notes.
- Use separate source and claim IDs. Every claim must cite existing source IDs and one or more locked requirement IDs.
- Record volatile facts with an as-of date. Explain conflicts instead of choosing silently.
- Set requirement status and claim confidence by the rules below.
- Every commission requirement ID must appear exactly once in requirements. Do not invent requirement IDs.
- Web and report material requires publisher and URL. Every source requires at least one useful note.
- For transcript, interview-response, first-person-note, evaluation-note, or other operator-supplied material, publisher, URL, and published_at may be JSON null.

${REQUIREMENT_STATUS_RULES}

OUTPUT
Return one bare JSON object and nothing else. No Markdown fence, preamble, commentary, or trailing note. Use exactly the shown keys; use empty arrays rather than omitting collections. Return no commission object or editorial-authority fields.

${formatEvidencePackageContract(commission.commission_fingerprint)}`
}
