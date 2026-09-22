# L03 — author fan-out, measured

*22 September 2026. `pnpm readiness:fanout` against
`questura_readiness_scratch`, real Payload, real Postgres. 6/6 checks passed.*

## The question

`authoredArticlesTarget` reads an author's published articles a page at a
time (`AUTHOR_PAGE_SIZE = 200`) instead of asking for all of them at once.
Fifteen unit tests cover that it paginates, that `hasNextPage` is the
authority, and that a page boundary cannot skip a document. None of them
measure anything — they run against a handful of fake documents.

What was never measured: what a save by an author with a large career
actually costs.

## What was measured

| articles | tags | paths | answer | peak heap | time | delivery requests |
|---:|---:|---:|---:|---:|---:|---:|
| 250 | 502 | 250 | 0.1 MB | 19.8 MB | 57ms | 9 |
| 1,000 | 2,002 | 1,000 | 0.4 MB | 54.6 MB | 67ms | 31 |
| 4,000 | 8,002 | 4,000 | 1.8 MB | 54.6 MB | 261ms | 121 |
| 16,000 | 32,002 | 16,000 | 7.1 MB | 71.8 MB | 1,409ms | 481 |

*Answer* is the size of the returned target, counted exactly. *Peak heap* is
sampled every 5ms during the call, above a settled baseline.

## What it says

**Pagination does what it was for, and only that.** Each round trip is
bounded at 200 rows. The *answer* is not bounded by anything: every page's
tags and paths are appended to one array and returned whole, so the answer
grows exactly linearly — 64× the articles produced 63.91× the answer.

**Memory is not the problem.** 7.1 MB of target at sixteen thousand
articles is small, and peak heap grew only 3.6× while the corpus grew 64×,
because the peak is dominated by the per-page document materialisation rather
than by the accumulation. There is no memory cliff here.

**Delivery is the problem, and it is the one nobody had counted.** Delivery
chunks at a hundred entries per request and sends them *sequentially*
(`delivery.ts`, deliberately, so a large rename does not burst the frontend).
At sixteen thousand articles that is **481 sequential HTTP requests** for one
save. At a conservative 30ms each, that is a quarter of an hour of a worker
holding one job.

None of this is a bug today — Questura's largest author has a handful of
articles. All three numbers grow with the size of a career, and the one that
grows worst is the one furthest from where anybody would look.

## A measurement note worth keeping

The first version of this script reported "bytes per article" from the heap
delta and produced 57 KB per article — a figure that is meaningless, because
a peak taken during the call includes every page's documents that V8 has not
collected yet. The "retained" figure was worse: at a thousand articles it
came out *smaller* than at two hundred, since Payload's own caches move more
than the target does.

The answer's size is now counted rather than inferred. Heap is still
reported, because headroom is a real operator question, but it is not used to
derive a per-article cost.

## Still not covered

The fan-out inside a real editor save with a write transaction open — this
calls the function directly, so the transaction is not held. And the 481
requests are counted, not sent: what the frontend does with a sequential
burst of that size is a hosted question.
