# Listicle research workspace — implementation

Implements the approved Workbench from `prototypes/research-workspace.html`.

Opening candidate research defaults to **Research workspace**. The existing
**Automated research (existing)** tab retains its findings table, edits,
validation, coverage, gap requests, budgets and history. Opening the manual
workspace never invokes a provider or reads an external source.

## Ownership and storage

`listicle_angle_selections` stores run-level discovery search selections.
`listicle_profile_blurbs` stores completed prose, deduplicated across the profile.
Neither owns entry-level editorial research.

`listicle_entry_research_briefs` therefore owns six editable slots at
`(run_id, candidate_id)`, with profile identity, order revision, a context hash,
optimistic version and supporting finding IDs. Hand edits clear the changed
slot's inherited attribution. Readiness means only that the two core slots are
filled; it is not a claim of source verification.

`listicle_research_imports` retains the external packet, selected fields,
local-to-durable fact ID mapping, staff attribution and idempotency receipt.
Rejected claims and open questions remain readable in the workspace's import
notes. They do not become findings or brief text automatically.

Opening is an explicit POST: it can establish the candidate/profile link without
buying automated research. GET and preview do not change saved material.
Preview validates JSON on the server and returns proposed field changes. Apply
validates again, refuses uncertain/wrong branch identity, and checks the brief
version and current list/branch context under a SQLite write transaction.
Sources, findings, brief references and import receipt commit together or roll
back together. Reusing an import key with different content is a conflict;
repeating identical content is idempotent. Different import keys still use the
fact bank's existing claim/source deduplication.

Imported findings have `origin=external_import`, `validation=not_checked` and
normal existing evidence/source records. External dates remain assertions on
the finding/import, not verified page publication metadata. An automated
source-reading pass may subsequently verify an untouched imported finding;
operator edits retain the existing version protection.

The approved packet contract has no per-slot fact-ID map. Each applied slot
therefore references the selected packet's supporting set, explicitly labeled
as such in the UI. It does not claim an inferred sentence-level citation.

## Prompt

`workspace_prompt.txt` carries the approved prototype's rules and JSON contract.
The server supplies exact Google identity, list standard/exclusions, source
leads, search angles, subject terms, and a bounded retained-claims context with
validation, scope, channel, dates and citations. Discovery sightings remain
leads, never evidence. Copying is user-controlled; the app sends nothing to an
external model.

## Blurb, one place at a time

Once a brief has its two core slots, the workspace builds a blurb prompt from
the run's working title (the seed, not the research request's label), the
Google name, the filled slots and the facts behind them. Fact IDs such as
"(f1, f2)" are stripped. The operator copies the prompt into a model of their
choice and pastes the blurb back; the app calls no model for blurbs. An in-app
Opus call was tried and removed at the operator's request.

`listicle_entry_blurbs` holds the pasted text at `(run_id, candidate_id)` with
an optimistic version and the brief version it was saved against, so a later
brief edit marks the blurb "brief changed since". Rules live in
`blurb_prompt.txt`. Depth follows the brief: two sentences for a thin one, up
to four with people, history or recognition. Reviews are material, never
sources: what a review found is stated as plain fact, never "a reviewer said"
or a review date.

## Delivery boundary

This delivers the manual research path. Adapting automated output into the
same editorial packet remains the later pass described in the handoff. The
existing automatic research engine is otherwise unchanged. The discovery
pipeline's downstream writing stage is not introduced by this change.

## Verification

API coverage: read-only preview, parsing, selective persistence, minimal manual
briefs, idempotency, wrong-branch/stale requests, invalid citations, and rollback
of a partial import. UI coverage: workspace default, selecting import fields,
manual edits afterward, tab switching and existing automated controls.
Browser inspection used the saved McCarthy's candidate on Mac localhost.
No paid research, external import, or brief edits were applied to that real run.
