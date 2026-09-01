"""The prompt the operator carries to a flagship model, with the article.

The run already knows everything wrong with what it wrote: the measured
constraint checks, the sentence spread, the readiness blockers, the problems
the audit named. All of it is recorded where nobody reads it. This assembles it
into something a person pastes into Claude or ChatGPT along with the finished
piece.

Two decisions shape it.

**It carries the brief, not only the complaints.** A model told "the sentences
are too uniform" smooths the prose and quietly drifts the piece. A model told
what the article is for, who reads it, and the line that defines failure fixes
the flatness while protecting what the article is. The `fails_if` line is the
whole point of the brief and it goes in every time.

**It carries the house rules that are easy to break by accident.** The em dash
ban and the hyphenated compound ban are deliberate, and a chatbot asked to
improve rhythm will reach for an em dash within a sentence or two. Telling it
not to is cheaper than reading the result and finding out.

**And it has to say how to lengthen a sentence, not only what it cannot use.**
Asked to vary the rhythm and forbidden the dash in the same breath, a model has
one tool left: the full stop. A version of the Medellin article came back from
an outside model with 65 sentences where the pipeline wrote 54, a spread of 5.0
where the pipeline had 7.7, and **zero** sentences over 25 words where the
pipeline had six. Every cut landed on a subordinate clause -- "667 people per
day, *which* falls far short of" became two sentences -- which is exactly the
joint the rhythm fix in `2bd89fb1` had just added.

Not proven to have come from this prompt: the operator had also been editing by
hand. But the failure matches the prompt's shape precisely, and it is the same
trap `anti_ai_tells.py` had before that commit, where the only escape offered
from an aside was "split it". So the wording here now mirrors what those rules
settled on: length comes from subordination, and splitting is the last resort
rather than the house style.

It is generated, never hand edited. Operator influence belongs in a control
carrying its own validated field; typed text into a generated prompt leaves
nothing downstream able to say what was actually asked for.
"""

from __future__ import annotations

from typing import Any

from .contracts_v4 import ArticleBrief
from .support import _safe_dict, _safe_str

# Below this, the prose is varied enough that saying so would be noise.
SPREAD_WORTH_MENTIONING = 0.45

# One sentence past 25 words for every this-many sentences, as a floor.
#
# Crowding alone missed the failure it most needed to catch. Run 062c0b86
# (2026-09-01) came back with 64 sentences, 2 of them past 25 words and 16
# under 8, and a crowding share of 0.36 -- comfortably under the threshold, so
# nothing was said. The prose was choppy: three sentences in the whole article
# used a subordinating clause.
#
# That is the metric and the fault coming apart. Adding very short sentences
# widens the distribution and *improves* the crowding number while making the
# writing worse, so an article can chop its way to a passing score.
#
# Derived rather than tuned. `anti_ai_tells` already requires every section to
# carry at least one sentence over 25 words; a section runs 7 to 10 sentences,
# so one in fifteen is a floor well below what the house rules already demand,
# and it is not a number picked to fit three articles. It separates them
# correctly all the same: Lima 1-in-75 and Huaca 1-in-32 both fire, Medellin
# 1-in-9 stays quiet, and Medellin is the one that read well.
LONG_SENTENCE_AT_LEAST_EVERY = 15


def _measured_problems(checks: dict[str, Any]) -> list[str]:
    """What the run measured about its own prose, as instructions.

    Only what is actually wrong. A clean article should produce a short prompt,
    not a long one with every measurement in it.
    """
    problems: list[str] = []

    share = checks.get("sentence_widest_band_share")
    count = checks.get("sentence_count")
    if isinstance(share, (int, float)) and isinstance(count, int) and count:
        long_ones = checks.get("sentences_over_25_words") or 0
        short_ones = checks.get("sentences_under_8_words") or 0
        crowded = share >= SPREAD_WORTH_MENTIONING
        starved = long_ones * LONG_SENTENCE_AT_LEAST_EVERY < count
        if crowded or starved:
            # Named for the faults that actually fired, and both when both
            # did. Telling a choppy article its sentences "sit within five
            # words of each other" describes something that is not wrong with
            # it, and an instruction opening on a wrong diagnosis is easy to
            # dismiss. Picking one when both are true has the same problem in
            # the other direction, so neither is dropped.
            if crowded and starved:
                fault = (
                    f"The sentences are too uniform and too short. "
                    f"{round(share * 100)}% of the {count} sentences sit "
                    f"within five words of each other, only {long_ones} run "
                    f"past 25 words, and {short_ones} are under 8."
                )
            elif starved:
                fault = (
                    f"The sentences are too short and too alike. Only "
                    f"{long_ones} of {count} run past 25 words and "
                    f"{short_ones} are under 8, so the article moves in short "
                    "steps with nothing carrying two ideas at once."
                )
            else:
                fault = (
                    f"The sentences are too uniform. {round(share * 100)}% of "
                    f"the {count} sentences sit within five words of each "
                    f"other, and {long_ones} run past 25 words."
                )
            problems.append(
                f"{fault} Fix this by joining, never by splitting: where one "
                "fact explains another, carry both in one sentence using "
                "because, which, while, after or so that, and let short "
                "sentences land the points. Length comes from subordination. "
                "Cutting a long sentence in two makes this measurement worse, "
                "not better, and cutting content is never the fix."
            )

    if checks.get("target_word_count_met") is False:
        direction = _safe_str(checks.get("word_count_direction"))
        delta = checks.get("word_count_delta")
        if direction and isinstance(delta, int) and delta:
            problems.append(
                f"The article is {abs(delta)} words {direction} the agreed "
                "length. Fix it by editing, never by inventing facts."
            )

    if checks.get("paragraph_length_met") is False:
        problems.append("The paragraphs are the wrong length for this piece.")

    return problems


def build_polish_prompt(
    *,
    brief: ArticleBrief,
    article_markdown: str,
    title: str,
    constraint_checks: dict[str, Any],
    readiness_blockers: list[str],
    audit_problems: list[str] | None = None,
) -> str:
    """One prompt, ready to paste. Returns the whole thing including the article."""
    checks = _safe_dict(constraint_checks)
    problems = _measured_problems(checks)
    problems += [_safe_str(item) for item in readiness_blockers if _safe_str(item)]
    problems += [_safe_str(item) for item in (audit_problems or []) if _safe_str(item)]

    numbered = (
        "\n".join(f"{index}. {problem}" for index, problem in enumerate(problems, 1))
        or "1. Nothing measurable is wrong with it. Improve the prose only where "
        "you can do so without touching a fact."
    )

    material = (
        "\n".join(f"- [{item.kind}] {item.statement}" for item in brief.material)
        or "- Nothing first hand. This is researched rather than reported."
    )
    must_name = "\n".join(f"- {item}" for item in brief.must_name) or "- Nothing named."

    return f"""You are editing a finished article. Fix what is listed and change nothing else.

WHAT THIS ARTICLE IS FOR
Reader: {brief.reader.primary_reader}
Their question: {brief.reader_question}
What it should make them do: {brief.outcome}
What it is built on: {brief.spine}
It must name:
{must_name}
What the writer actually has:
{material}

IT FAILS IF: {brief.fails_if}

That last line is the test. An edit that fixes the list below and moves the
article toward that failure has made things worse, not better.

WHAT TO FIX
{numbered}

RULES YOU MUST NOT BREAK
- No em dashes, and no substitutes. A comma bracketed aside is an em dash in
  disguise. This is deliberate: em dashes now read as a sign of AI writing and
  this publication does not use them.
  This is not a reason to reach for a full stop. The replacement for a dash is
  a subordinate clause, not two sentences: "the room is warm throughout, which
  is what makes the terrace worth booking" keeps the thought whole and needs no
  dash. Long sentences are wanted, and commas joining clauses are correct. What
  is banned is a comma standing in for a dash around an aside.
- No hyphenated compounds. "A visa for long stays", never "a long stay visa".
  Proper names keep their hyphens; nothing else does.
- Invent nothing. No new places, prices, dates, dishes, names or numbers, and
  no adjective that implies a fact the article does not already carry. If a
  sentence cannot be improved without a fact you do not have, leave it alone.
- Keep every fact, figure and proper noun exactly as it is.
- Keep the headings and the section order.
- Do not add a conclusion, a summary, or a line telling the reader what they
  just read.

Return the complete edited article as markdown, and nothing else. No preamble,
no notes on what you changed, no list of edits.

TITLE: {title}

ARTICLE
{article_markdown}
"""
