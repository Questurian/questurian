# Questurian has one voice; tones are removed and the sibling pipelines are retired

## Context

Prompt2Blog sends the writer two documents about voice through two channels: a
tone profile chosen from six, and a brand voice chosen from three. They
contradict each other, and the defaults contradict each other hardest. The
default tone, Practical, says "the writer is invisible, no first person, no
visible judgment, no personality, do not rank options against each other or
build a thesis." The Questurian voice says it has a view and says it, and never
hides behind even-handedness. Both are sent on every run.

The file named for the house voice is not a voice document at all. It is a
rulebook: a banned-lexicon list, price and date formatting, point-of-view rules,
a required takeaways section, hedging rules. Across all the writing instruction
in the system there are 41 prohibitions and not one sentence describing what a
good piece is. That is why bans could never fix the register — the model was
told which doors were locked and never which room to be in.

The tone files are shared. `app/shared/tone_profiles.py` reads
`data/prompt2blog/tones`, and URL2Blog and YouTube2Blog both serve it. The
anti-AI block and its enforcement pass are likewise shared, used by nine
YouTube2Blog stages, the itinerary composers (ADR 0021) and editor_assist.

## Decision

**There is one Questurian voice, in one file, and it describes what Questurian
is rather than what it must not do.** The six tone profiles are removed. A
publication has one voice; six selectable personalities are six chances to
contradict it, and the variation between articles now comes from the Article
Brief, which knows who is reading and what the piece is for.

**The mechanical rules survive as a separate, much shorter file.** Price format
with an as-of frame, dates in full, no fabricated trips or meals, sentence-case
headings, no in-article attribution. These cannot be inferred from character and
have to be stated. Most of the old rulebook does not survive: the banned-lexicon
list in particular duplicates ground the anti-AI block covers better. Two files,
because the voice will be edited by feel and the rules by fact.

**The anti-AI enforcement pass is dropped for Prompt2Blog only.** The rules run
once, at compose. Every other consumer keeps the enforcement pass, because they
do not receive the compose-prompt rework that replaces it and would otherwise
lose a backstop and gain nothing. Edits to the rule text itself are shared.

> **Amended (writer audit, finding 05).** This was never carried out. The
> whole-article enforcement pass stayed wired in after compose and after
> repair, and a test recorded the discrepancy rather than resolving it. It is
> now replaced rather than dropped, because the backstop turned out to be
> worth keeping and the rewrite was not.
>
> Prompt2Blog runs `content/style_cleanup.py`. The deterministic validator is
> unchanged and still free. What changed is the expensive half: the errors
> carry line numbers, so only the sections containing them are sent, only
> those may be returned, and the rest of the article is untouched bytes. The
> pass is also given the repair lock -- the brief's scope and the limitations
> on the facts this article used -- which the old one never saw, so it can
> tell a qualification from a stylistic tic. One attempt; a result that is not
> cleaner than what it was given is discarded, and the draft is re-grounded
> either way. Other consumers still call `enforce_anti_ai_tells_markdown`.

**URL2Blog and YouTube2Blog are deleted, not left to break.** Removing the
shared tone list and changing the shared voice rules leaves them looking
completely usable while failing mid-run or, worse, quietly producing worse
articles. They are removed from the navigation and return an explicit retired
response.

## Consequences

- The outline stage receives a house voice for the first time. It has never been
  told which publication it works for, and this is the largest single change in
  the v4 writing path.
- Prompt2Blog is the only article pipeline in service until the others are
  rebuilt onto this foundation. That was chosen over keeping them alive with
  copied voice files, which would silently diverge the moment the voice improved.
- The house rules are no longer uniform across pipelines. This reverses an
  earlier deliberate choice to keep them in one shared place, and is scoped to
  the enforcement pass rather than the rule text to keep the divergence small.
- Prompt2Blog's cleanup can now leave a style error unresolved. That is the
  trade the amendment above makes deliberately: an unresolved em dash is
  visible in the run record and costs a reader nothing, where a stripped
  as-of date is invisible and costs them the fact.
- The tone dropdown disappears from the composer. Any stored run referencing a
  `tone_id` is unreadable, which is already true under ADR 0031.
- Voice quality becomes editable by a person in one file, in English, without
  touching code.
