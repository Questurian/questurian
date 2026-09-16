# Itinerary Day 1 dry run

**Question:** Does a short Grill produce enough direction for a research-capable model to return a coherent, factual day we can render?

This is a synthetic Lima test fixture using the real Light Full Day slot definitions. It is not the saved browser draft, actual user testimony, a researched itinerary, or an implemented feature. No model API calls were purchased. No venue recommendations have been verified yet.

## Run this experiment

1. Read `02-sample-grill.md` to see a simulated interview and its agreement.
2. Inspect `03-agreed-day-direction.json`: the structured result consumed by research.
3. Copy the entire `05-copy-this-research-prompt.md` into your preferred high-tier model with web research enabled. It is self-contained: starting data, agreement, canonical voice export, and JSON Schema are embedded. Ask it to return its complete JSON result or a JSON file.
4. Return that JSON to Codex. We will inspect source support and route/time consistency, then render a standalone HTML day preview matching the current itinerary workspace. Editorial warnings will remain visibly separate from reader prose. No app import is required for this experiment.

Optional: use `04-test-the-grill-prompt.md` to conduct a fresh interactive Grill instead of the simulated one. Replace the accepted-direction section in the research prompt with your new agreed result before running research; do not combine conflicting agreements.

## What to judge

- Day has one clear purpose and fits the other two days.
- Specific venues earn their roles; morning and afternoon add different experiences.
- Sources substantiate identity, offerings and important operational claims.
- Schedule includes realistic movement, meals, rest and optionality; uncertain travel stays labeled.
- Required failures remain visible. Unsupported claims do not become polished prose.
- JSON can drive both readable day view and expandable evidence/review details.

## Current files

- `01-starting-data.json`: realistic synthetic setup, existing app slot shape.
- `02-sample-grill.md`: six simulated turns plus agreement.
- `03-agreed-day-direction.json`: proposed experiment contract, including decision provenance.
- `04-test-the-grill-prompt.md`: optional interactive Grill test.
- `05-copy-this-research-prompt.md`: main copy-ready research/composition prompt.
- `finished-day.schema.json`: standalone return contract; not production schema.

No generated finished day exists yet. The next evidence is the model's returned JSON, not an invented “successful” output. Voice content in the portable prompt is a snapshot of the two canonical files under `apps/backend/data/prompt2blog/voice/`; regenerate exports when those files change.
