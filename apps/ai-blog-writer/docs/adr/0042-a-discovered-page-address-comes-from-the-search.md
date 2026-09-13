# A discovered page's address comes from the search, not from the answer

Amends ADR 0040, *A research request reads its sources*. The sequence, the page
budget, the checks in code and the two-generation ceiling are unchanged. What
changes is **where the address of a page the search found comes from.**

## Context

0040's discovery prompt asked the model for "the publisher's own URL". A
grounded Gemini call does not see publisher URLs. It sees redirect links, and
the provider returns the pages it actually used separately, as grounding
metadata. So the model typed addresses it had to guess.

The record in `data/pipeline.db`, for every discovery call made under 0040:

- **Both calls that ran to the token ceiling died in the same place**, typing
  `https://www.rappi.com.pe/restaurantes/1000000…` — a numeric id the model had
  never seen (`06d62efa37ad`, `99acd08ac6bb`). The second one had already bought
  twenty reviews.
- **In the calls that parsed, 7 of 23 typed addresses led nowhere**: four 404s
  and three hosts that do not exist, such as `mccarthysirishpub.com.mx`.
- The provider's own result list was captured on every call and never used.

Issue #560 read the failures as the model's and proposed a more expensive one. A
larger model given the same instruction would be expected to guess more
plausibly, not to stop guessing.

## Decision

**The model does not write addresses.** It names the site and the page title as
the search result shows them, and quotes the passage, as before.

**Code matches each entry to a search result**, in order of how far the match
can be trusted: the provider's own attribution, then an identical link, then the
same site by hostname or by name ("Rappi" is the result whose site is called
rappi). A result goes to one entry at most.

Attribution is found by position. On the first real run (`002330f8b00c`) the
supports were short stretches of the answer — "Alitas.", "S/ 37.80." three
times in three entries, and the tail of one entry running into the next — and
the first version, which compared quoted text, matched none of them. A stretch
belongs to the entry its last character sits in, or the next one when it ends
between two. Replayed over that run's stored results, all nine described pages
match the result they name; with no supports at all, seven do by name.

**Described pages are read in order of scope**: this branch, then unplaced, then
brand-wide, then results nobody described. The same run spent reading budget on
Rappi listings for three other branches because they came first.

**Only a search result's address is ever opened.** An entry that matches no
result keeps its description, is marked `address_from: none`, and is not read. A
result no entry described is read after the described ones. A call with no
results opens nothing.

**The result list and supports are stored on the attempt**, so the matching can
be checked later without paying for the search again.

**Temperature goes from 0.05 to the provider default of 1.0** for this call.
Near-greedy decoding is the setting under which a repeated character keeps being
the likeliest next one.

## Consequences

- The Rappi-style loop loses its trigger: there is no long numeric id to type.
- Dead links from guessed addresses stop costing page budget.
- Matching by site is coarse. Two results on one site with no provider
  attribution are both read, and the description goes with the first.
- Vertex does emit grounding supports for a JSON answer (nine, on the first
  real run). Their stretches are placed by sentence, not by entry, so the
  position rule is a measurement of one run and may need revisiting.

**First evidence.** The first run under this decision (`002330f8b00c`) finished
with `STOP` at 7,129 tokens instead of looping, and every page it opened
resolved to a real publisher address — no 404s and no invented hosts. One run.
