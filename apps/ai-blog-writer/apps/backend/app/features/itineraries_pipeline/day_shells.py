"""Reserved built-in Day Shell ids.

The ABW frontend is the canonical home of built-in Day Shell definitions
(`day-shells.constants.ts`); the autobuild request always carries the selected
shell's explicit slots, so the backend never resolves a shell by id. The ids
are reserved here only so Day Shell Library CRUD can reject collisions and
keep built-ins immutable.
"""

from __future__ import annotations

BUILT_IN_DAY_SHELL_IDS: frozenset[str] = frozenset(
    {
        "full_day_balanced",
        "light_full_day",
        "food_focused_full_day",
        "adventure_full_day",
        "nightlife_full_day",
        "premium_indulgence_day",
        "culture_and_stroll_day",
    }
)
