# Mission: Understand the Questurian codebase at an architectural level

## Why
Alan wants to operate on this codebase with the judgment of a senior developer who just onboarded properly: knowing how the four contexts fit together, where the risks live, and which areas to investigate before making major changes — instead of learning the system one bug at a time.

## Success looks like
- Can explain the system end-to-end (LM enrichment → Payload → public site; ABW pipelines → LexicalJSON → Payload) without consulting docs.
- Can name the cross-context contracts (`location-guide-contract.json`, MediaSet ADRs, the *missing* LexicalJSON contract) and why each boundary is HTTP-only.
- Can locate the right entry point for any change (payload.config.ts, LM main.ts, ABW feature routes) and predict its blast radius.
- Can defend or challenge the top architectural risks identified in the overview app.

## Constraints
- Learns best from polished, navigable reference artifacts (requested a static HTML app, not a markdown dump).
- The codebase itself (CONTEXT.md chain + ADRs) is the primary source — lessons should ground in repo files, not generic architecture theory.

## Out of scope
- Learning the individual frameworks (Payload, Hono, LangGraph) beyond what's needed to read this repo.
- Public-site visual/UX work.
