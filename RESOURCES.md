# Questurian Architecture Resources

## Knowledge

- [Repo: root `CONTEXT.md`](./CONTEXT.md)
  The DDD-style context map: ownership table, shared glossary, cross-repo rules, reading order. The single highest-trust source on this architecture. Use for: any "who owns X" question.
- [Repo: nested `CONTEXT.md` files](./apps)
  `apps/{questura,location-manager,ai-blog-writer,dashboard}/CONTEXT.md` plus package-level ones. Use for: per-context glossaries, domain rules, open questions.
- [Repo: ADRs](./apps/questura/docs/adr)
  30 ADRs across `apps/questura/docs/adr`, `apps/ai-blog-writer/docs/adr`, `apps/location-manager/docs/adr`. Use for: *why* the media pipeline, listicle pipeline, and visitor auth look the way they do — including retired approaches.
- [Generated: Codebase Overview app](file:///Users/alanmalpartida/Desktop/codebase-overview/index.html)
  The onboarding/architecture-review artifact built 2026-06-10. Use for: system diagrams, risk register, evidence-tagged claims.
- [Docs: Payload CMS 3](https://payloadcms.com/docs)
  Official docs. Use for: collections, access control, migrations, Lexical editor — Questura server is built on this.
- [Docs: Turborepo](https://turbo.build/repo/docs)
  Use for: how root `turbo.json` task orchestration works across the nested workspaces.
- [Article: Feature Toggles (aka Feature Flags) — Pete Hodgson, martinfowler.com](https://martinfowler.com/articles/feature-toggles.html)
  The canonical toggle taxonomy (release/experiment/ops/permission; longevity × dynamism). Use for: the env-flag vs runtime-toggle decision on Photo Import (lesson 0002).
- [Docs: Google Places API (New) — Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos) and [pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
  Use for: what each LM Photo Import call costs and why preview fan-out is the expensive part.
- [Generated: Photo Import Gate Map](./reference/photo-import-gate-map.html)
  Code-verified table of every Google-spending path in LM and its gate status (audited 2026-06-10).

## Wisdom (Communities)

- Not yet gathered — this mission is repo-specific, so "community" is mostly the repo's own git history and the team. Revisit if framework-level questions (Payload, BetterAuth, LangGraph) come up.

## Gaps

- No resource yet on the deployment/production topology — it is not visible in the repo (no CI config found). Needs an answer from the team, not a document.
- No formal spec exists for the ABW → Payload LexicalJSON boundary (flagged in two CONTEXT.md files).
