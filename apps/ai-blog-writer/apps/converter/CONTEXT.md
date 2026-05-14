# AI Blog Writer / Converter — Context

## Purpose
Stateless conversion service: Markdown / HTML → Lexical state, and back. Used so generated content lands in Payload's rich editor.

## Tech stack
- TypeScript 5.5, Express 4.21
- Lexical 0.17 (`@lexical/html`, `@lexical/markdown`, `@lexical/headless`)
- JSDOM 24.1 (DOM in Node)

## Ubiquitous language

| Term | Definition |
|------|------------|
| Markdown | Plaintext source. |
| HTML | Intermediate. |
| Lexical State / LexicalJSON | Editor serialization format. |
| `EditorState` | Complete Lexical document. |
| `SerializedLexicalNode` | One node in the Lexical tree (HeadingNode, CodeNode, ListNode, TableNode, LinkNode, HorizontalRuleNode, …). |
| `markdownToLexical(markdown)` | md → LexicalState. |
| `htmlToLexical(html)` | HTML → LexicalState. |
| `lexicalToHtml(lexicalState)` | LexicalState → HTML. |

## Routes

- `POST /convert/markdown`
- `POST /convert/html`
- `POST /convert/validate`
- `GET /health`

## Boundary

- **Owns:** all content-shape transformations.
- **Delegates:** everything else. No DB. No LLM. No domain logic. No persistence.

## Shared contracts

Standalone — no imports from sibling packages. Only Lexical + JSDOM + Express.
