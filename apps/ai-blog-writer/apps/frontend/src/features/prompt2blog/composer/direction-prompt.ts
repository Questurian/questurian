import type {
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogInputOption,
} from '../api'

function formatCatalog(
  items: Array<{ id: string; label: string; description: string }>
): string {
  return items
    .map(
      (item) =>
        `- ${item.id} (${item.label}) — ${item.description.replace(/\s+/g, ' ').trim()}`
    )
    .join('\n')
}

function condense(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Forms, with the two sections that decide which one fits.
 *
 * The catalog used to reach the chooser as one summary line per form. That is
 * how "Where to eat in Lima right now" became a News Report: "reports a timely
 * development" is a fair reading of "right now", and the sentence that would
 * have stopped it — "do not use for broad destination summaries" — was sitting
 * in the same file, unshipped. Roughly 6k characters, on a prompt that is
 * copied and pasted once.
 */
function formatForms(
  items: Prompt2BlogEditorialOptionsResponse['forms']
): string {
  return items
    .map((item) =>
      [
        `- ${item.id} (${item.label}) — ${condense(item.description)}`,
        `  USE WHEN: ${condense(item.use_when)}`,
        `  DO NOT USE WHEN: ${condense(item.do_not_use_when)}`,
      ].join('\n')
    )
    .join('\n\n')
}

/**
 * How many research questions a target length needs.
 *
 * One question produced one answer, and one answer produced a 388 word article
 * against a 1400 word target. The writer had three and a half times more space
 * than material and filled it by naming publications. The floor is not a
 * quality bar, it is arithmetic: a question yields roughly one section, and a
 * section runs three to four hundred words.
 */
export function researchQuestionsForLength(targetWordCount: number): number {
  if (!Number.isFinite(targetWordCount) || targetWordCount <= 0) return 3
  return Math.min(8, Math.max(3, Math.round(targetWordCount / 350)))
}

/**
 * Today, as the direction model has to be told it.
 *
 * The prompt carried no date at all, and a model with no date and no browsing
 * has no way to tell a list that came out from a list that is scheduled. That
 * is how five questions came to rest on a ranking whose ceremony is still
 * three months away.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** A premise a previous round of this same commission established as false. */
export type SettledFalsePremise = {
  statement: string
  basis: string
}

export function buildDirectionPrompt(
  title: string,
  location: string,
  catalog: Prompt2BlogEditorialOptionsResponse,
  length: Prompt2BlogInputOption | null,
  asOfDate: string = todayIso(),
  settledFalse: readonly SettledFalsePremise[] = []
): string {
  const questionCount = researchQuestionsForLength(length?.target_word_count ?? 0)
  /*
   * Carried back from a run the gate stopped. Without it the operator returns
   * to this step with nothing but their own memory of what was refuted, and
   * the model — which still cannot browse — is free to propose it again.
   */
  const settledFalseBlock = settledFalse.length
    ? `\n\nALREADY ESTABLISHED AS FALSE
A previous round of this commission researched these and found them untrue. Do not build any option on them, and do not restate one in softer words.
${settledFalse
  .map((premise) => `- ${premise.statement} — ${premise.basis}`)
  .join('\n')}`
    : ''
  const requirementSample = Array.from(
    { length: questionCount },
    (_unused, index) =>
      `        { "requirement_id": "r${index + 1}", "question": "a required research question", "assumption_ids": ["premise ids this question needs, or none"] }`
  ).join(',\n')

  return `You are a commissioning editor for a travel publication. Turn one working title and location into exactly three materially different editorial options for a human editor to review. Do not select an option yourself.

INPUT
Original title: ${JSON.stringify(title.trim())}
Location: ${JSON.stringify(location.trim())}
Today's date: ${asOfDate}

BOUNDARY
Do not browse, research facts, or write the article. This step chooses editorial direction only. Phrase requirements as required research questions; never invent answers or citations.

PREMISE BEFORE QUESTIONS
You cannot browse, so every fact you take for granted is unverified. Write those down instead of burying them in questions.
Each option declares a premise: the short list of things it assumes are already true and already published. A question built on a false premise cannot be researched by anyone, and it takes every question that depends on it down with it.
- Dates are the usual trap, and today is ${asOfDate}. An annual list, ranking, award, report, season or ceremony carrying a year does not exist until it is published, and a year that has started is not a year that has finished. Check the date against what you are assuming before you build questions on it.
- Write each premise as one sentence a researcher can confirm or refute on its own: "The 2026 edition of the guide has been published." Not "the dining scene is changing", which nothing can refute.
- Only things that carry the article go in the premise. Do not list the location existing, or the subject being popular.
- List in assumption_ids every premise a question needs. A question that stands on its own carries an empty array.
- Spread the risk. If every question in an option names the same uncertain premise, that option is one refutation away from nothing, and it is worth building the option so some questions survive.${settledFalseBlock}

THE TITLE IS A PROMISE
The original title is what a reader sees before they read anything. Every option must deliver on it. Ask literally what that reader came for, and make sure the option hands it over: "Where to eat in Lima right now" promises named restaurants, dishes, neighborhoods and prices, so an option that explains a trend in the dining scene without naming a single place to eat has broken the promise, however defensible the article is on its own terms. An option may angle the promise. It may not replace it.
Read the USE WHEN and DO NOT USE WHEN lines under every form before choosing one. Pick the form that keeps the promise, not the form the title's mood suggests. A title containing "right now" is not automatically news.

RESEARCH QUESTIONS
Every option needs at least ${questionCount} required research questions.
- One question asks one thing. Split anything joined by "and" into separate questions, because one unanswerable half currently blocks the whole article.
- No question may depend on another question's answer. "Which restaurants made the list" followed by "what do those restaurants charge" is a chain: nobody can research the second until the first comes back, so a first question that fails silently deletes the rest. Ask each question against something the premise or the subject already names.
- Questions must be answerable by looking something up, and together they must cover enough ground to fill the target length. A single question yields a single section.
- Name things. A question about "the current shift in the dining scene" cannot be researched; "which restaurants opened in Barranco in 2026" can, and "what does a tasting menu cost in Barranco in 2026" is a second question that stands without waiting for the first.

EDITORIAL RULES
- Read the original title as the controlling reader promise.
- Keep one explicit primary subject, and make it a nameable thing: a place, a business, a route, a neighborhood, a document, a named event. An abstraction like "the current shift underway in the dining scene" is not a subject, it is a summary, and it produces an article about nothing in particular.
- Context-only references can calibrate the piece but cannot organize it. Context-only references cannot become co-subjects or section headings.
- A comparator is an approved co-subject. single_subject cannot contain one.
- head_to_head needs at least one comparator. ranked_set needs at least two.
- Comparison form cannot use single_subject scope; head_to_head scope uses Comparison form.
- Choose zero to four unique topic modules.
- Choose one plain-language primary reader and zero or more unique audience tags.
- Give every option one specific exclusion.
- Make options materially distinct in direction, reader question, and outcome. They may share an article form when the editorial takes remain genuinely different.

OUTPUT
Return one JSON object and nothing else. No Markdown fence, preamble, or trailing note. Echo original_title and location exactly, character for character. Return exactly three options. Use the three fixed option_id values in the shown order. Every object must contain exactly the shown keys. Every option needs at least ${questionCount} requirements, numbered from r1 upward, and at least one premise, numbered from a1 upward. Every id in assumption_ids must name a premise declared by that same option.

{
  "schema_version": 3,
  "original_title": ${JSON.stringify(title.trim())},
  "location": ${JSON.stringify(location.trim())},
  "options": [
    {
      "option_id": "direction-1",
      "direction": "A concise editor-to-writer direction statement",
      "form_id": "one exact form id",
      "topic_module_ids": ["zero to four exact module ids"],
      "audience": {
        "primary_reader": "one specific reader",
        "tags": ["zero or more exact audience tag ids"]
      },
      "core_reader_question": "the exact question this article answers",
      "reader_outcome": "what the reader can decide or do afterward",
      "primary_subject": "the one controlling subject, named",
      "scope": {
        "mode": "one exact scope mode id",
        "references": [
          { "name": "the controlling subject", "role": "primary_subject" }
        ]
      },
      "premise": [
        { "assumption_id": "a1", "statement": "one checkable sentence this option assumes is already true and already published" }
      ],
      "requirements": [
${requirementSample}
      ],
      "exclusions": ["a specific way this direction must not drift"],
      "rationale": "why this option is distinct and worth commissioning"
    },
    {
      "option_id": "direction-2",
      "direction": "...",
      "form_id": "...",
      "topic_module_ids": [],
      "audience": { "primary_reader": "...", "tags": [] },
      "core_reader_question": "...",
      "reader_outcome": "...",
      "primary_subject": "...",
      "scope": {
        "mode": "...",
        "references": [{ "name": "...", "role": "primary_subject" }]
      },
      "premise": ["at least 1, same shape as above"],
      "requirements": ["at least ${questionCount}, same shape as above"],
      "exclusions": ["..."],
      "rationale": "..."
    },
    {
      "option_id": "direction-3",
      "direction": "...",
      "form_id": "...",
      "topic_module_ids": [],
      "audience": { "primary_reader": "...", "tags": [] },
      "core_reader_question": "...",
      "reader_outcome": "...",
      "primary_subject": "...",
      "scope": {
        "mode": "...",
        "references": [{ "name": "...", "role": "primary_subject" }]
      },
      "premise": ["at least 1, same shape as above"],
      "requirements": ["at least ${questionCount}, same shape as above"],
      "exclusions": ["..."],
      "rationale": "..."
    }
  ]
}

ALLOWED form_id VALUES
${formatForms(catalog.forms)}

ALLOWED topic_module_ids VALUES
${formatCatalog(catalog.topic_modules)}

ALLOWED audience.tags VALUES
${formatCatalog(catalog.audience_tags)}

ALLOWED scope.mode VALUES
${formatCatalog(catalog.scope_modes)}

ALLOWED scope.references[].role VALUES
${formatCatalog(catalog.reference_roles)}

Use IDs exactly. Never return labels in ID fields and never invent an ID.`
}
