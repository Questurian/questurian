# Itinerary Autobuild uses an in-backend function-calling agent, not Payload MCP

Itinerary Autobuild needs an AI that reads a free-text brief and decides for itself what data to fetch from Payload. We implement that as a **LangGraph function-calling agent inside the ABW backend** (expanding `itineraries_pipeline`), with Payload search exposed as bound tools the model calls over Payload's **REST API**. We deliberately rejected a Payload MCP plugin: the adaptive querying we want comes from tool use, not from MCP, which is only a transport for letting *external* clients reach the CMS. We have no external client — it's all our own backend — so MCP would add a server, a protocol to debug, and a hole in the meta-monorepo's "HTTP-only coupling" rule for zero added capability.

The backend **reads** Payload using the **operator's JWT passed on the generate request** (reusing the existing `app/features/images/payload_client.py` pattern); it never holds Payload write credentials. The **frontend owns all writes** via the existing builder→Payload sync path. The endpoint is **synchronous** for v1 (batched scoring keeps it to ~5–7 LLM calls); if latency demands, it can be promoted to the async run-based pattern later without changing the graph internals.

## Considered Options

- **Payload MCP plugin** — rejected: conflates "adaptive AI" (which is tool use) with "cross-process transport" (which is MCP); no external consumer justifies it; violates the HTTP-only cross-context rule.
- **Backend with its own Payload write credentials** — rejected: a new auth surface; the frontend already owns writes with the operator's token.
- **Async run-based pipeline from day one** — deferred: unnecessary plumbing at this scale; the seam to add it later is clean.

## Consequences

- Retrieval is testable and deterministic; only intent extraction, fit-scoring, and reason-writing are LLM-driven.
- The generate request must carry the operator's JWT; an expired/missing token fails retrieval, not writes.
