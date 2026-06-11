# Custom Day Shells move to a backend Day Shell Library with snapshot-on-select

Custom Day Shells were draft-local: stored inside the owning itinerary Draft, invisible to every other itinerary. That made forking a built-in shell (the only way to "edit" one, since built-ins are immutable code constants) a per-draft chore. We decided to persist Custom Day Shells in a backend **Day Shell Library** (ABW's SQLite, per-deployment — not multi-tenant), shared across all itinerary drafts.

Selecting a library shell **snapshots its slots into the Draft** rather than referencing the shell by id. The autobuild request keeps sending explicit shell slots, unchanged. Consequence: library edits and deletes never propagate to existing itineraries — an itinerary set up in March generates the same day structure in April regardless of what happened to the library shell it came from.

## Considered Options

- **Stay draft-local** (the documented status quo) — no new storage, but every fork of a built-in must be recreated per itinerary.
- **localStorage shared library** — cross-draft reuse without a backend resource, but shells silently differ per browser/machine.
- **Reference-by-id instead of snapshot** — library edits propagate everywhere, but a saved itinerary's generation behavior can change behind the operator's back, and deleting a shell strands drafts that reference it.

## Consequences

- Built-in Day Shells remain immutable; "Edit" on a built-in forks it into a library shell.
- Shell editing is list-ops only (add from Shell Slot presets, remove, duplicate, free reorder); slot internals stay preset-defined.
- Saving a shell only adds it to the library — it is applied to days explicitly via the day pickers, replacing the old silent apply-to-all-days behavior.
- Requires a new backend CRUD resource for shells; the frontend Draft schema keeps embedded shell slots, so no draft migration is needed.
