# MediaSet Status Backfill

`MediaSet.status` is now an admin-only coarse state:

- `empty`: no variants
- `usable`: `thumbnail` variant exists
- `partial`: one or more variants exist, but no `thumbnail`

Existing Payload rows may still contain the legacy `complete` value. Do not update production rows without a reviewed migration run.

## Dry-run default

A migration script should default to dry-run and print each planned change:

```ts
for each media-set:
  variants = mediaSet.variants ?? {}
  present = Object.values(variants).filter(Boolean)
  nextStatus =
    present.length === 0 ? 'empty'
    : variants.thumbnail ? 'usable'
    : 'partial'

  if mediaSet.status !== nextStatus:
    print { id, title, currentStatus: mediaSet.status, nextStatus }
```

## Write mode

Write mode must require an explicit flag or env var such as `--write`:

```ts
if (writeMode) {
  await payload.update({
    collection: 'media-sets',
    id: mediaSet.id,
    data: { status: nextStatus },
    overrideAccess: true,
  })
}
```

Run dry-run first, review counts by status, then run write mode only after approval.
