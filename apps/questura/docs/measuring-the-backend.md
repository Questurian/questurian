# Measuring the backend

Three instruments, all off unless asked for. They exist because the
2026-09-20 backend audit could describe what the code did and could not say
what it cost, and "about a second on a laptop" is not a number anyone can act
on.

**Read counts before timings.** Milliseconds are a property of the machine,
the data and the moment. Statement counts, document reads and peak concurrency
are properties of the code: they mean the same thing on a laptop, on the Linux
box and on whatever serverless platform comes next, and they are what a change
can be held to.

## 1. `Server-Timing` on a public read

Per request: total time, SQL statements and their cumulative time, document
reads, references deduplicated, peak read concurrency, whether the work was
coalesced, whether search used the index or the fallback.

Turn it on with `PUBLIC_API_DIAGNOSTICS=1`, anywhere. Outside production a
request header does the same for one call:

```bash
curl -sD- -o /dev/null -H 'x-questura-diagnostics: 1' \
  http://localhost:4000/api/public/location-homepages/peru/lima | grep -i server-timing
```

```
server-timing: total;dur=954, sql;dur=5438;desc="382 statements (cumulative)",
               reads;desc="43", deduped;desc="0", peak;desc="6/6", coalesced;desc="ran"
```

`sql;dur` is **cumulative across overlapping statements**, so it exceeds wall
time whenever reads overlap. That ratio is the useful part: it says roughly how
many statements were in flight at once, which is the thing a connection pool
runs out of.

The header is refused in production unless the operator set the env var. What
a request costs is operational detail, and whether to publish it is not the
caller's decision.

### Comparing concurrency levels

Outside production, `x-questura-read-limit` overrides one request's page read
budget, so levels can be compared without restarting between them:

```bash
for limit in off 1 4 6 12; do
  curl -sD- -o /dev/null -H 'x-questura-diagnostics: 1' \
    -H "x-questura-read-limit: $limit" \
    http://localhost:4000/api/public/location-homepages/peru/lima | grep -i server-timing
done
```

`off` restores the pre-2026-09-20 behaviour — a separate six-read counter per
block rather than one per page. It also skips request coalescing, so a
measurement is never confounded by a join.

## 2. `pnpm measure:api`

Samples every public read repeatedly, holds the first request out of the
distribution (it compiles routes and warms caches), and reports p50/p95/p99
next to the statement and read counts from `Server-Timing`.

```bash
cd apps/questura/apps/server
pnpm measure:api
pnpm measure:api -- --runs 20 --concurrent 4
pnpm measure:api -- --json /tmp/api.json --html /tmp/api.html
```

```
endpoint             n     cold      p50      p95      p99   stmts  reads    bytes
----------------------------------------------------------------------------------
city homepage        7   2202.9   1129.9   1250.5   1250.5     382     43    56251
search               7    100.7     72.9     78.3     78.3      26      -    12417
location feed        7    104.4     78.1     88.9     88.9      28      -    10640
article index        7     61.2     37.3     42.6     42.6       9      -    11352
navigation menu      7     32.4     14.9     18.6     18.6       -      -      864
```

`--concurrent N` fires N identical requests at once, which is how request
coalescing is checked: one row reports its statements and the rest report zero.

A development server compiles on first hit and does not optimise, so its
absolute numbers say nothing about production. Comparisons between two runs on
the same server do.

## 3. `GET /api/internal/db-stats`

What the database side of one process is doing: pool occupancy, the connection
budget across processes, the statement budgets in force, every backend on the
database by state, and how many rows the search index holds.

Secret-gated with `DB_STATS_SECRET`:

```bash
curl -s -H "Authorization: Bearer $DB_STATS_SECRET" \
  http://localhost:4000/api/internal/db-stats | jq
```

**`payloadPool.waiting` is the number to watch.** Above zero means requests are
queueing for a connection rather than for the database — the pool is the
bottleneck, and adding CPU will not help. `advisoryLockPool.waiting` above zero
means webhook deliveries are queueing for a lock connection.

`advisoryLockPool.pooledConnection: true` means session-level advisory locks
are running through a transaction pooler, which does not work. Production
refuses to boot in that state; this is how to see it anywhere else.

## What none of this measures

Sustained load, saturation, or anything about the live deployment. Sampling an
idle development server a few times establishes that a change did not make
things worse on that server. Capacity is a separate exercise against a
production build with a representative corpus, and it has not been done — see
the audit's "Evidence needed next" and the launch checklist.
