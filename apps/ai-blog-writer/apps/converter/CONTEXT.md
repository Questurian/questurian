# Context: AI Blog Writer / Converter

## Scope

Stateless conversion service. Translates between three content shapes:

- Markdown ↔ Lexical state
- HTML → Lexical state
- Lexical state → HTML

Used so that anything AI Blog Writer generates lands in Payload's Lexical editor without lossy round-trips.

## Out of Scope

- Persistence (no DB, no filesystem).
- LLM calls.
- Any business logic about articles, runs, drafts, sync.
- Authentication — the service is meant to run inside the trust boundary.

## Purpose

Markdown is the canonical AI Blog Writer output. Payload uses Lexical. Without a dedicated converter, every feature would reinvent this transformation. Stateless and replaceable on purpose.

## Tech Stack

- TypeScript 5.5
- Express 4.21
- Lexical 0.17 (`@lexical/html`, `@lexical/markdown`, `@lexical/headless`, plus rich-text/list/link/table/code packages)
- JSDOM 24.1 (DOM polyfill in Node)

## Glossary

### Markdown

Definition: plaintext source. The canonical AI Blog Writer output format.

### HTML

Definition: an intermediate, used for richer content (tables, embedded media) that doesn't survive Markdown losslessly.

### Lexical State / LexicalJSON

Definition: Lexical's editor serialization format. What Payload stores in rich-text fields.

### `EditorState`

Definition: a complete Lexical document tree.

### `SerializedLexicalNode`

Definition: one node in the tree. Concrete subtypes include `HeadingNode`, `CodeNode`, `ListNode`, `TableNode`, `LinkNode`, `HorizontalRuleNode`.

### `markdownToLexical(markdown)`

Function. Markdown → `EditorState`.

### `htmlToLexical(html)`

Function. HTML → `EditorState`.

### `lexicalToHtml(lexicalState)`

Function. `EditorState` → HTML.

## Routes

- `POST /convert/markdown` — body Markdown → `EditorState`.
- `POST /convert/html` — body HTML → `EditorState`.
- `POST /convert/validate` — checks an `EditorState` parses cleanly.
- `GET /health` — liveness.

## Relationships

- The converter has **no relationships** with sibling packages at the code level. It is invoked over HTTP only.
- Inputs come from `apps/backend` (generated Markdown) or `apps/frontend` (Drafts).
- Outputs go to whichever caller asked.

## Domain Rules

- Conversion must be deterministic for a given input — no time-dependent or random output.
- The service must remain stateless; if a request needs context, the caller passes it in the body.
- No catch-all error swallowing; malformed input must return 4xx with an explanation.

## Naming Conventions

- Functions: verb noun, lower-camel (`markdownToLexical`, `lexicalToHtml`).
- Routes: `/convert/<source-format>`.

## Decisions

- **Headless Lexical (`@lexical/headless`)** is used so we don't pull in React rendering on the server.
- **JSDOM** rather than a native DOM, because Lexical's HTML path assumes a DOM.
- **Express, not Hono**, only because the package predates the meta-mono's Hono convergence; not worth migrating.

## AI Guidance

- **Inspect first:** `src/index.ts` (single file) — routes and conversion calls live together.
- **Do not** add LLM calls or domain logic here. Any drift away from "shape transform only" is wrong.
- **Do not** introduce shared types with sibling packages; this service is intentionally standalone.
- **Preserve verbatim:** `EditorState`, `SerializedLexicalNode`, `markdownToLexical`, `htmlToLexical`, `lexicalToHtml`.

## Open Questions

- No regression tests at the converter boundary. Should there be a corpus of (Markdown, expected Lexical) pairs?
- Tables and embedded media survive HTML but not Markdown — should the calling features know to prefer HTML for those?
- Does anyone actually consume `POST /convert/validate`? If not, prune it.
