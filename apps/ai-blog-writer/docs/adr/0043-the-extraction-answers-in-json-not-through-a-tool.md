# The extraction answers in JSON held to a schema, not through a forced tool

Amends ADR 0040, *A research request reads its sources*, on one point: how the
extraction call gets its structured reply. The one-extraction ceiling, the
checks in code and the no-retry rule are unchanged.

## Context

0040 made the extraction a forced tool call (`structured`, tool
`record_evidence`) because a guaranteed shape removes unparseable replies.

The first real extraction under the reviews API (`002330f8b00c`) read twenty
reviews and five pages well — named reviewers, dated, quoted — and saved
nothing. `gemini-2.5-pro` finished with `MALFORMED_FUNCTION_CALL`, having written
`print(default_api.record_evidence(claims=[...]))` as text, cut off mid-entry.

Two things were wrong, both ours:

- **The transport.** This backend had already met this failure. The listicle
  review call (`_review_call`) failed the same way on two of four real attempts
  and moved to a JSON reply for exactly this reason. The extraction was written
  on the older pattern.
- **The ceiling.** The forced-tool path sent the caller's 8,192 straight to the
  provider, bypassing the backend's 64,000 output floor, and on a thinking model
  the thinking is charged against that number. Gemini reports a tool call cut
  off by the ceiling as malformed, not as a length problem (`cut_review.py`
  recorded that first).

## Decision

**The extraction calls `model_calls.schema_json`**: one generation with a
response schema (`response_mime_type` + `response_schema`), no tool, no retry.
The ceiling goes through `get_vertex_llm`, so the output floor applies. A reply
that stops mid-value raises and says so. The job's registry kind is `json`.

**A failed extraction's receipt carries the error's message**, not only its
class. "WriterModelError" alone sent the last reader to a terminal log.

## Consequences

- The `print(default_api...)` failure has no transport to happen on.
- A response schema is still a constraint the provider may reject for
  complexity; that would arrive as a failed call with its message on the receipt.
- `EXTRACTION_MAX_TOKENS` no longer bounds the packet in practice.

**Not yet proven.** Tests show the call is made this way. Only a real extraction
shows the model answering well through it — and recovering `002330f8b00c`
through `extract_only` costs one generation and no reviews.
