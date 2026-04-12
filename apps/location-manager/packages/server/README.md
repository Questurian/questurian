# server

To install dependencies:

```bash
pnpm install
```

To run:

```bash
pnpm run index.ts
```

This package is managed with [pnpm](https://pnpm.io) in the monorepo.

## Taxonomy correction rules (operators)

Create or preview rules from the admin UI at `/admin/taxonomy` (**Add correction rule**), or call the HTTP API on the running server (default API port `4002`; change the host/port if yours differs).

Body shape for both endpoints: `incorrect_value`, `correct_value`, and `part_type` (`country` | `city` | `neighborhood`). Values must be lowercase kebab-case.

**Preview (dry run — no DB writes)**

```bash
curl -s -X POST "http://localhost:4002/api/admin/taxonomy/corrections/preview" \
  -H "Content-Type: application/json" \
  -d '{"incorrect_value":"bras-lia","correct_value":"brasilia","part_type":"city"}'
```

**Create rule and apply to existing data**

```bash
curl -s -X POST "http://localhost:4002/api/admin/taxonomy/corrections" \
  -H "Content-Type: application/json" \
  -d '{"incorrect_value":"bras-lia","correct_value":"brasilia","part_type":"city"}'
```

**Example: neighborhood `lima` → `lima-centro` (Peru)**

Use the same two URLs as above; only the JSON body changes:

```json
{"incorrect_value":"lima","correct_value":"lima-centro","part_type":"neighborhood"}
```

For neighborhood rules, bulk updates only change **three-part** keys (`country|city|neighborhood`). Two-part keys such as `peru|lima` are not rewritten as neighborhoods.
