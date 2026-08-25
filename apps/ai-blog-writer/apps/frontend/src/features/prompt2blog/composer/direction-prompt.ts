import type { Prompt2BlogEditorialOptionsResponse } from '../api'

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

export function buildDirectionPrompt(
  title: string,
  location: string,
  catalog: Prompt2BlogEditorialOptionsResponse
): string {
  return `You are a commissioning editor for a travel publication. Turn one working title and location into exactly three materially different editorial options for a human editor to review. Do not select an option yourself.

INPUT
Original title: ${JSON.stringify(title.trim())}
Location: ${JSON.stringify(location.trim())}

BOUNDARY
Do not browse, research facts, or write the article. This step chooses editorial direction only. Phrase requirements as required research questions; never invent answers or citations.

EDITORIAL RULES
- Read the original title as the controlling reader promise.
- Keep one explicit primary subject. Do not broaden a place-centered idea into an accidental comparison.
- Context-only references can calibrate the piece but cannot organize it. Context-only references cannot become co-subjects or section headings.
- A comparator is an approved co-subject. single_subject cannot contain one.
- head_to_head needs at least one comparator. ranked_set needs at least two.
- Comparison form cannot use single_subject scope; head_to_head scope uses Comparison form.
- Choose zero to four unique topic modules.
- Choose one plain-language primary reader and zero or more unique audience tags.
- Give every option at least one concrete required research question and one specific exclusion.
- Make options materially distinct in direction, reader question, and outcome. They may share an article form when the editorial takes remain genuinely different.

OUTPUT
Return one JSON object and nothing else. No Markdown fence, preamble, or trailing note. Echo original_title and location exactly, character for character. Return exactly three options. Use the three fixed option_id values in the shown order. Every object must contain exactly the shown keys.

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
      "primary_subject": "the one controlling subject",
      "scope": {
        "mode": "one exact scope mode id",
        "references": [
          { "name": "the controlling subject", "role": "primary_subject" }
        ]
      },
      "requirements": [
        { "requirement_id": "r1", "question": "a required research question" }
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
      "requirements": [{ "requirement_id": "r1", "question": "..." }],
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
      "requirements": [{ "requirement_id": "r1", "question": "..." }],
      "exclusions": ["..."],
      "rationale": "..."
    }
  ]
}

ALLOWED form_id VALUES
${formatCatalog(catalog.forms)}

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
