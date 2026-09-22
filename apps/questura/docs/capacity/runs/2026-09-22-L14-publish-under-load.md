# L14 — publishing while people are reading

*22 September 2026. `pnpm readiness:publish-under-load`: both apps as
production builds, medium corpus, 6 concurrent readers, two 20-second phases.
8/8 checks passed.*

## The question

Everything measured until now took one thing at a time. Reads were measured
with nothing being written; publishing was measured with nobody reading. The
state nobody had looked at is the ordinary one: an editor saving while the
site is being read.

It is not obviously fine. A save holds a write transaction open while it works
out what to refresh. The drain that follows delivers to the frontend, which
then has to **rebuild** every invalidated page from the backend — so a publish
becomes a burst of origin reads at the moment readers are also asking. Each
piece is bounded on its own; whether they are bounded together is a different
question.

## The comparison

Same corpus, same twelve paths, same six readers, same twenty seconds. The
only difference between the phases is the publishing.

| | reads | p50 | p95 |
|---|---:|---:|---:|
| **Phase A** — readers only | 13,559 | 8ms | 14ms |
| **Phase B** — readers + 8 publishes | 11,686 | 8ms | **17ms** |

Eight saves, each including its delivery: p50 72ms, p95 183ms. The queue was
empty 5.7 seconds into the window.

## What it says

**No reader ever saw a broken page.** All 11,686 reads during the publish
window were a real page carrying exactly one version of the headline — never
a mixture, never an error shell, never an empty body.

**And the publish really did reach them.** 7,060 of those reads carried the
*new* headline. Without that number the check above would be vacuous: a
publish nobody observed cannot have shown anybody a half-published page.

**Publishing costs readers a little, and it is a cost rather than a cliff.**
p95 went from 14ms to 17ms — 1.2×. Throughput fell 14%. Nothing failed, no
admission gate refused anything, the connection pool never had a waiter, and
the refresh queue drained to empty with nothing in `failed`.

## Two things the check had to learn first

Both produced wrong answers that looked like findings, and both are the same
mistake in different clothes: comparing the wrong string.

**1. The new title has to be disjoint from the old one.** The first version
appended a suffix — `"<original> [under load …]"` — which *contains* the
original, so "the page carries the old title or the new one" was true of every
page whatever happened. The marker is now a string with no overlap, which
makes the test an exclusive or.

**2. An article's SEO title is a separate field and does not follow its
title.** Searching the whole document found the old string in `<title>` and
the Open Graph tags long after the rename — correctly, because
`seo_section_seo_title` is its own field. A whole-document check sees both
versions at once and cannot tell them apart; it reported 7,000
"half-published" pages that were nothing of the sort. The check now reads the
**headline** — the first `<h1>` that is not the brand mark, which renders as
an `h1` three times per page.

And one smaller one: React escapes an apostrophe, so the single title in the
corpus containing one matched neither version and ninety-one correct pages
were reported as broken. Entities are decoded before comparison, and a failing
sample now prints the headline it actually saw, so the next surprise is
diagnosable instead of mysterious.

## What this is not

One machine, one backend process, one frontend process, six readers, a warm
cache. It says publishing and reading do not break each other and puts a
number on what publishing costs readers. It is not a capacity result. On
Cloudflare the rebuild burst reaches a different cache from a different number
of isolates — **H03** and **H04**.
