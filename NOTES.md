# Teaching Notes

- Alan prefers polished, navigable HTML artifacts over raw markdown (explicitly requested a static HTML/CSS/JS app, openable by double-click, on his Desktop).
- Deviation from the standard lesson layout: the first "lesson" for this mission is the full codebase-overview app at `~/Desktop/codebase-overview/` (his requested location), not a file in `./lessons/`. Future smaller lessons can live in `./lessons/` as usual.
- Wants evidence discipline: claims tagged as code-verified vs inferred vs unclear. Keep this convention in future lessons.
- Ground everything in repo files (CONTEXT.md chain, ADRs, actual source) — never parametric architecture generalities.
- Repo rule reminder: pnpm only, never npm (AGENTS.md + memory).
- Lesson numbering: the codebase-overview app counts as lesson 0001 (lives on Desktop, see above), so files in `./lessons/` start at 0002.
- Alan learns well from real cost/risk stakes in his own repo (the Photo Import flag audit, lesson 0002) — prefer auditing/extending live features over toy examples.
