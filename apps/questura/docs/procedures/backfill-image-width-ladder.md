# Procedure: backfill the image width ladder

**Who this is for:** whoever is deploying issue #563, and anyone who later
suspects a photo is serving broken.

Every MediaSet variant file is meant to have five small siblings beside it:

```
lima-bar-12_square.webp          ← the variant, 1080px
lima-bar-12_square_w128.webp     ← the rungs
lima-bar-12_square_w256.webp
lima-bar-12_square_w384.webp
lima-bar-12_square_w640.webp
lima-bar-12_square_w960.webp
```

The reader-facing client works those names out from the variant URL rather than
asking an API which ones exist. That is what lets the browser be offered a
choice without any change to the payload or the MediaAsset schema.

**The catch, and the reason this page exists:** a name the client asks for and
the CDN does not have is a *broken image*, not a fallback. `srcSet` has no error
recovery. New photos get their rungs automatically — the pipeline writes them,
and an `afterChange` hook covers anything attached outside it — but photos
published before that code existed have none.

---

## Order of operations

**Ship the server half, run the backfill, then ship the client half.** In that
order. The two halves are separate commits so this is easy.

While only the server half is live, nothing changes for readers: rungs are
written and never asked for. The moment the client half is live, every rung it
names has to exist.

---

## Run it

Dry run first. It reports exactly what it would write and writes nothing:

```bash
cd apps/questura/apps/server && npx tsx scripts/backfill-width-ladder.ts --dry-run
```

Then for real:

```bash
cd apps/questura/apps/server && npx tsx scripts/backfill-width-ladder.ts
```

It needs `BUNNY_STORAGE_API_KEY` and `BUNNY_STORAGE_ZONE_NAME`, which the
server's env already carries.

Expect a line per photo it touches and a summary at the end. It exits non-zero
if any rung failed.

## It is safe to re-run

The job **never writes to the database.** It reads variant rows, fetches the
files they already point at, and PUTs new files under new names. No MediaAsset
is updated, no MediaSet is reassembled, and no existing file is ever
re-uploaded. The MediaSet corruption of 2026 came from a mass regeneration that
rewrote existing bytes; this one cannot, by construction.

It is also resumable. Every rung is checked before any image work happens, so a
re-run over already-backfilled media costs one HEAD request per rung and no
decoding. If it fails halfway, just run it again.

## If a photo looks broken

Re-run the job. A missing rung is the only failure this design has, and a re-run
is the fix. If it keeps failing on the same file, the summary names it — that
file is probably unreadable on Bunny, which is a separate problem.
