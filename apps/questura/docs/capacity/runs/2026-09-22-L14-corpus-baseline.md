# L14 — a baseline against a corpus that can have a bottleneck

*22 September 2026. `pnpm readiness:corpus-baseline`: the `readiness-corpus`
scenario at three deterministic corpus sizes. 6/6 checks passed. Raw JSON in
`2026-09-22-L14-corpus-{small,medium,large}.json`.*

## The question

Every number in this series came from the development copy: 31 locations, 25
articles. That is a good regression baseline — a read that went from 8ms to
400ms would show. It cannot *find* anything, because at 25 articles a query
that is O(n) and one that is O(n²) produce the same millisecond.

## The corpus

`scripts/readiness/corpus.ts`, deterministic and marked. Every value derives
from the row index and a seed, so two runs a week apart compare the same rows;
everything lives under one country slug (`zz-readiness`) and one author, so
`clear` is an exact inverse rather than a guess.

| | cities | published articles | locations |
|---|---:|---:|---:|
| small | 6 | 24 | 19 |
| medium | 40 | 1,600 | 161 |
| large | 200 | 8,000 | 1,001 |

`large` multiplies the **number of cities** rather than the articles in one,
because a per-city cost is exactly what the 25-article corpus hides: one city
with 5,000 articles and 200 cities with 25 each are the same row count and
very different systems.

## Statements per request

The column that answers the question. Latency at these sizes is dominated by
fixed costs; a query count that grows with the row count is a per-row round
trip, and that is the shape that does not survive a real site.

| step | small | medium | large |
|---|---:|---:|---:|
| sitemap (every public URL) | 13 | 15 | **29** |
| country cities | 4 | 4 | 4 |
| article index, one city | 2 | 2 | 2 |
| article index, whole country | 2 | 2 | 2 |
| search | 10 | 10 | 10 |
| locations menu | 4 | 4 | 4 |
| location search | 2 | 2 | 2 |
| *control: real Lima city page* | 171 | 171 | 171 |

## p95 latency and median response size

| step | small | medium | large |
|---|---|---|---|
| sitemap | 15ms / 7.6 KB | 77ms / 179 KB | **394ms / 859 KB** |
| country cities | 6ms / 511 B | 7ms / 3.0 KB | 7ms / 7.4 KB |
| article index, one city | 5ms / 989 B | 11ms / 4.5 KB | 22ms / 4.5 KB |
| article index, whole country | 7ms / 4.5 KB | 14ms / 4.5 KB | 30ms / 4.5 KB |
| search | 24ms | 38ms | 34ms |
| locations menu | 7ms / 1.5 KB | 24ms / 4.7 KB | 72ms / 19.8 KB |
| location search | 5ms | 7ms | 5ms |
| *control* | 111ms | 90ms | 92ms |

## What it says

**Nothing is a per-row round trip.** The corpus grew **333×** and no read's
statement count grew more than **2.2×**. Everything is either a bounded query
or a paged scan.

**The sitemap is the one read whose cost tracks the corpus**, and it is a size
problem rather than a query problem: 29 statements, **859 KB**, p95 **394ms**
at 8,000 published articles. It returns every public URL by definition, so
this is not a defect — but it is the read that will be uncomfortable first,
and the growth is in bytes, not queries.

**The control confirms the comparison.** A real Lima city page was measured in
all three runs and did not move: p95 111ms → 90ms → 92ms, and **171 statements
every time**. The three runs are comparing the corpus, not the machine. (That
171 is its own standing item — the city page's query cost is the article
blocks, recorded separately.)

## A harness bug that read as a server failure

The first run reported the sitemap step failing at the large corpus. It was
not the server: twelve samples per size across three sizes inside ninety
seconds spends the sitemap's thirty-per-minute budget, and ten of twelve came
back `429`. The sandbox Redis is now flushed between sizes. That is not a way
around the limiter — the limiter's behaviour is proven on purpose in the L12
run — it is so that a measurement of something else is not secretly a
measurement of the previous phase.

## Still owed on L14

The plan also asks for valid-session load, publish-during-load contention,
browser assets and sustained fault recovery. None of those are covered here.
This is one machine, one process, a warm cache, no concurrency, and synthetic
article bodies.
