# City Discovery Featured Grid Limits

This note documents the current hover-featured bento grid behavior in:

- `src/features/CityDiscovery/pages/CitySelectionPage.tsx`

## Current Limits (As Implemented)

The interactive featured-grid logic is intentionally constrained and currently assumes a **single 6-card block**:

1. The interactive card set is hard-limited to the first 6 cities.
2. The desktop resolver is built around a 3-column grid where:
   - 1 featured card occupies a `2x2` area.
   - 5 remaining cards fill the remaining cells predictably.
3. Featured state persists on the last hovered card (no mouse-leave reset).
4. The animation system is FLIP-based and expects deterministic slot resolution, not free shuffling.

## Recommended Expansion Pattern

If we need more cards without rewriting the resolver, use content sections in this pattern:

- **6 cards** (interactive featured grid)
- **1 full-width card** (visual break / breakpoint card)
- **6 cards** (second interactive featured grid with the same rules)

In short: **`6 -> 1 -> 6`**.

## Why This Pattern Works

1. It keeps each interactive block bounded and predictable.
2. It avoids permutation chaos from trying to make one large grid with unlimited featured targets.
3. Each 6-card section can have its own local featured state that persists after hover.
4. The middle full-width card cleanly separates interaction zones and reduces cognitive load.

## Implementation Rule of Thumb

- Do not treat all cards in one giant pool.
- Treat each 6-card block as its own independent resolver scope.
- Reuse the same hover-feature + FLIP transition logic per block.
