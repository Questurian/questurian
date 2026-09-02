from __future__ import annotations

import re
import statistics
from typing import Any

from .content.markdown import _clean_title
from .content.source_citations import strip_source_citations
from .support import (
    _safe_bool,
    _safe_dict,
    _safe_int,
    _safe_str,
    _tokenize_words,
)

# Share of secondary keywords that must appear before the check passes.
SECONDARY_KEYWORD_COVERAGE_THRESHOLD = 0.6

# must_include items are hard requirements, so the bar is near-total. The
# per-item test is fuzzy (an item is a phrase, not a keyword), hence not 1.0.
MUST_INCLUDE_COVERAGE_THRESHOLD = 0.9

# The audit rubric calls 7-8 "acceptable with edits" and <=6 "requires a hard
# rewrite". Repair therefore fires below 7, not at or below it.
REPAIR_SCORE_THRESHOLD = 7

# Used when the auditor omitted a score. Neutral, and above the repair
# threshold, so a gap in the response is never itself a repair trigger.
NEUTRAL_QUALITY_SCORE = 7

# The constraint checks an article must satisfy to ship. This is the single
# list; `_should_run_repair` spends an attempt when one of these fails, and
# `policies.evaluate_readiness` refuses to mark the run ready while one still
# fails. Keeping both on the same tuple is what stops the gate that decides
# "try again" and the gate that decides "ship it" from disagreeing -- finalize
# used to check three of these and ignore the rest.
#
# `paragraph_length_met` is deliberately absent: it is a soft stylistic
# preference, it never triggered repair, and promoting it to a blocker would
# fail runs that nothing in the pipeline is able to fix.
#
# `target_word_count_met` was removed for the same reason plus a worse one
# (#432, A16). A 4% overage is not a failure any editor would recognise, and
# on the Lima run one four-word overage both capped the score below threshold
# and raised a separate constraint failure -- the same miss counted twice, and
# it bought a full regeneration of 1,041 words to trim forty.
#
# The measurement stays. A large miss is a symptom worth reporting, and
# `word_count_severity` below says which kind of miss it is; it is simply no
# longer a gate.
HARD_CONSTRAINT_CHECK_KEYS = (
    "cta_present",
    "primary_keyword_present",
    "secondary_keywords_present",
    "must_include_covered",
    "claims_grounded",
)

# Keys `_build_constraint_checks` returns that are measurements, not pass/fail
# verdicts. Every site that merges computed checks over the auditor's own
# `constraint_checks` has to drop these, or a count lands in a dict whose
# other values are booleans and reads as a check that failed. The sites used
# to each carry their own filter -- one by name, one by `_coverage` suffix --
# which meant a new measurement leaked into whichever list was not updated.
CONSTRAINT_MEASUREMENT_KEYS = frozenset(
    {
        "word_count_severity",
        "word_count_estimate",
        "word_count_delta",
        "word_count_direction",
        "word_count_target_min",
        "word_count_target_max",
        "secondary_keyword_coverage",
        "must_include_coverage",
        # Sentence spread is measured and never gated. Every one of these has
        # to be listed or a count lands among booleans and reads as a check
        # that failed.
        "sentence_count",
        "sentence_mean_words",
        "sentence_stdev_words",
        "sentence_widest_band_share",
        "sentences_over_25_words",
        "sentences_under_8_words",
        "sentence_variety_note",
    }
)


# The auditor is told "overall_score may not exceed 6" while a measured check
# is failing, and it does not reliably obey: the Medellin run returned 10 with
# a failing check in the same prompt. Asking a model to cap its own score is a
# request; this is the enforcement. Only deterministic booleans count here --
# the auditor's own `audience_match` / `tone_match` judgements are editorial
# opinion and must not silently cap a score.
MEASURED_CHECK_SCORE_CEILING = 6


def enforce_measured_check_ceiling(
    quality: dict[str, Any], computed_checks: dict[str, Any]
) -> list[str]:
    """Clamp `overall_score` while any measured check is failing.

    Returns the failing check names so callers can report them.
    """
    failed = sorted(
        key
        for key, value in computed_checks.items()
        if isinstance(value, bool) and value is False
    )
    if failed:
        current = _safe_int(
            quality.get("overall_score"), default=MEASURED_CHECK_SCORE_CEILING
        )
        quality["overall_score"] = min(current, MEASURED_CHECK_SCORE_CEILING)
    return failed


def _extract_narrative_focus(writing_brief: dict[str, Any]) -> str:
    editorial = _safe_str(writing_brief.get("editorial_instructions"))
    if editorial:
        return editorial
    goal = _safe_str(writing_brief.get("goal"))
    if goal:
        return goal
    # `perspective` is still read so briefs posted to the runtime endpoint
    # before the rename keep resolving.
    destination = _safe_str(writing_brief.get("destination_context")) or _safe_str(
        writing_brief.get("perspective")
    )
    return destination or "No additional narrative focus provided."


# A brief asking for "flights to Lima" is satisfied by prose saying "flight to
# Lima". Raw substring matching failed those, which drove keyword checks false
# and bought a full repair rewrite for a plural.
def _canonical_tokens(value: str) -> list[str]:
    tokens: list[str] = []
    for token in _tokenize_words(value):
        token = token.removesuffix("'s").rstrip("'")
        if len(token) > 4 and token.endswith(("ses", "xes", "zes", "ches", "shes")):
            token = token[:-2]
        elif len(token) > 3 and token.endswith("s"):
            token = token[:-1]
        if token:
            tokens.append(token)
    return tokens


def _contains_phrase(text: str, phrase: str) -> bool:
    phrase_tokens = _canonical_tokens(phrase)
    if not phrase_tokens:
        return True

    text_tokens = _canonical_tokens(text)
    window = len(phrase_tokens)
    for start in range(len(text_tokens) - window + 1):
        if text_tokens[start : start + window] == phrase_tokens:
            return True
    return False


# The width of the band that counts as "the same length". Five words apart is
# close enough that a reader hears the same beat twice.
SENTENCE_BAND_WIDTH = 5
# Above this share of an article inside one band, the prose reads as metered.
# The first article this pipeline produced sat at 0.57.
SENTENCE_CLUSTER_SHARE = 0.45


def _sentence_lengths(content: str) -> list[int]:
    """Word counts for every sentence of prose, headings excluded.

    A heading is not a sentence and counting it drags the numbers toward the
    short end of an article that is merely well sectioned.
    """
    body = "\n".join(
        line for line in content.splitlines() if not line.lstrip().startswith("#")
    )
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", body)]
    return [len(_tokenize_words(part)) for part in sentences if len(part.strip()) > 3]


def measure_sentence_spread(content: str) -> dict[str, Any]:
    """How varied the sentences are. Reported, never gated.

    The first article the v4 pipeline wrote averaged 11.3 words with 57% of its
    seventy five sentences inside a five word band and exactly one past 25. It
    read as accurate and mechanical, and nothing in the run said so, because
    nothing was counting. Once prose exists nothing blocks (ADR 0030), so this
    is a number the operator reads and acts on, not a gate.

    `sentence_widest_band_share` is the share of sentences inside the most
    crowded five word window. High is bad: it is the metronome, measured.
    """
    lengths = _sentence_lengths(content)
    if not lengths:
        return {
            "sentence_count": 0,
            "sentence_mean_words": 0.0,
            "sentence_stdev_words": 0.0,
            "sentence_widest_band_share": 0.0,
            "sentences_over_25_words": 0,
            "sentences_under_8_words": 0,
            "sentence_variety_note": "",
        }

    mean = statistics.mean(lengths)
    stdev = statistics.pstdev(lengths) if len(lengths) > 1 else 0.0
    busiest = max(
        sum(1 for length in lengths if start <= length < start + SENTENCE_BAND_WIDTH)
        for start in range(min(lengths), max(lengths) + 1)
    )
    share = busiest / len(lengths)
    long_ones = sum(1 for length in lengths if length > 25)
    short_ones = sum(1 for length in lengths if length < 8)

    note = ""
    if share >= SENTENCE_CLUSTER_SHARE or (long_ones == 0 and len(lengths) >= 20):
        note = (
            f"{round(share * 100)}% of sentences sit within {SENTENCE_BAND_WIDTH} "
            f"words of each other and {long_ones} run past 25. The prose will "
            "read as metered. Joining related facts into longer sentences is "
            "the fix; nothing here blocks."
        )

    return {
        "sentence_count": len(lengths),
        "sentence_mean_words": round(mean, 1),
        "sentence_stdev_words": round(stdev, 1),
        "sentence_widest_band_share": round(share, 3),
        "sentences_over_25_words": long_ones,
        "sentences_under_8_words": short_ones,
        "sentence_variety_note": note,
    }


def _estimate_paragraph_sentence_average(content: str) -> float:
    # Headings are not paragraphs. They used to be counted as one-sentence
    # blocks, so every `##` dragged the average down and a well-sectioned
    # article measured far shorter than it reads -- which is exactly the
    # article the length profiles ask for.
    paragraphs = [
        block.strip()
        for block in re.split(r"\n\s*\n", content)
        if block.strip() and not block.lstrip().startswith("#")
    ]
    if not paragraphs:
        return 0.0

    sentence_counts = []
    for paragraph in paragraphs:
        count = len(re.findall(r"[.!?](?:\s|$)", paragraph))
        sentence_counts.append(max(1, count))

    return sum(sentence_counts) / max(1, len(sentence_counts))


def _keyword_overlap_ratio(reference: str, text: str) -> float:
    ref_tokens = {token for token in _tokenize_words(reference) if len(token) > 3}
    if not ref_tokens:
        return 1.0

    content_tokens = set(_tokenize_words(text))
    overlap = ref_tokens & content_tokens
    return len(overlap) / len(ref_tokens)


def _build_constraint_checks(
    title: str,
    content: str,
    writing_brief: dict[str, Any],
) -> dict[str, Any]:
    combined = f"{title}\n\n{content}".strip()
    word_count = len(_tokenize_words(content))

    formatting = writing_brief.get("formatting") or {}
    paragraph_length_pref = _safe_str(formatting.get("paragraph_length"))
    target_word_count = _safe_int(formatting.get("target_word_count"), default=0)

    # The check carries which way it missed, not just that it missed. As a bare
    # boolean it told the auditor "wrong length" and left the direction to be
    # guessed; on the Lima restaurant run the guess was "too short" against a
    # draft 363 words over the ceiling, and both repair passes made the article
    # longer still. `word_count_delta` is the distance outside the accepted
    # band, signed: positive is over the ceiling, negative is under the floor.
    target_word_count_met = True
    word_count_delta = 0
    word_count_direction = "within"
    word_count_target_min = 0
    word_count_target_max = 0
    if target_word_count > 0:
        tolerance = max(100, int(target_word_count * 0.1))
        word_count_target_min = target_word_count - tolerance
        word_count_target_max = target_word_count + tolerance
        if word_count < word_count_target_min:
            word_count_delta = word_count - word_count_target_min
            word_count_direction = "under"
        elif word_count > word_count_target_max:
            word_count_delta = word_count - word_count_target_max
            word_count_direction = "over"
        target_word_count_met = word_count_direction == "within"

    # How badly, not just whether. A handful of words either way is editing; a
    # third of the article missing is a symptom of thin research and should be
    # reported as one rather than as a length problem.
    word_count_severity = _severity(
        word_count_delta, word_count_target_min, word_count_target_max
    )

    avg_sentences = _estimate_paragraph_sentence_average(content)
    paragraph_length_met = True
    if paragraph_length_pref.lower().startswith("short"):
        paragraph_length_met = avg_sentences <= 2.5
    elif paragraph_length_pref.lower().startswith("medium"):
        paragraph_length_met = 2.5 <= avg_sentences <= 5.5
    elif paragraph_length_pref.lower().startswith("long"):
        # Bounded on both sides. This used to be `>= 5.0`, which is unbounded
        # above and turned the gate into a hard requirement for wall-of-text
        # paragraphs -- against the long profile's own instruction to keep
        # structure scannable. Length comes from more sections, not longer
        # blocks, so an article that stays readable must not fail the check.
        paragraph_length_met = 3.0 <= avg_sentences <= 6.5

    cta = _safe_str(writing_brief.get("call_to_action"))
    cta_present = _keyword_overlap_ratio(cta, combined) >= 0.35 if cta else True

    seo = writing_brief.get("seo") or {}
    primary_keyword = _safe_str(seo.get("primary_keyword"))
    primary_keyword_present = _contains_phrase(combined, primary_keyword)

    secondary_raw = seo.get("secondary_keywords")
    secondary_keywords: list[str] = []
    if isinstance(secondary_raw, list):
        secondary_keywords = [
            _safe_str(item) for item in secondary_raw if _safe_str(item)
        ]

    # Requiring every secondary keyword verbatim made the check fail on almost
    # any realistic keyword set, and repair is told to satisfy it "naturally" --
    # which is a direct instruction to keyword-stuff against the SEO guidance.
    secondary_keyword_coverage = 1.0
    if secondary_keywords:
        matched = sum(1 for kw in secondary_keywords if _contains_phrase(combined, kw))
        secondary_keyword_coverage = matched / len(secondary_keywords)
    secondary_keywords_present = (
        secondary_keyword_coverage >= SECONDARY_KEYWORD_COVERAGE_THRESHOLD
    )

    # must_include items are user-stated hard requirements. Nothing used to
    # verify them, so "must mention visa-on-arrival" was silently droppable.
    must_include = [
        _safe_str(item)
        for item in (writing_brief.get("must_include") or [])
        if _safe_str(item)
    ]
    must_include_coverage = 1.0
    if must_include:
        matched = sum(
            1 for item in must_include if _keyword_overlap_ratio(item, combined) >= 0.6
        )
        must_include_coverage = matched / len(must_include)

    # audience_match and tone_match are deliberately absent. They are semantic
    # judgements and belong to the quality auditor; the token-overlap heuristic
    # that used to compute them here overrode the model on the two questions it
    # is actually good at. See _audit_rewrite.
    return {
        "must_include_covered": must_include_coverage >= MUST_INCLUDE_COVERAGE_THRESHOLD,
        "must_include_coverage": round(must_include_coverage, 3),
        "target_word_count_met": target_word_count_met,
        "word_count_delta": word_count_delta,
        "word_count_direction": word_count_direction,
        "word_count_target_min": word_count_target_min,
        "word_count_target_max": word_count_target_max,
        "paragraph_length_met": paragraph_length_met,
        "cta_present": cta_present,
        "primary_keyword_present": primary_keyword_present,
        "secondary_keywords_present": secondary_keywords_present,
        "secondary_keyword_coverage": round(secondary_keyword_coverage, 3),
        "word_count_estimate": word_count,
        "word_count_severity": word_count_severity,
        **measure_sentence_spread(content),
    }


# Above this share of the target, a length miss stops being an edit and starts
# being a symptom -- usually of thin research rather than of bad writing.
LARGE_LENGTH_MISS_RATIO = 0.15


def _severity(delta: int, lower: int, upper: int) -> str:
    """How badly a draft missed its band: `within`, `slight`, or `large`."""
    if not delta:
        return "within"
    target = (lower + upper) / 2 if upper > 0 else 0
    if target <= 0:
        return "slight"
    return "large" if abs(delta) / target > LARGE_LENGTH_MISS_RATIO else "slight"


def word_count_revision_instruction(checks: dict[str, Any]) -> str | None:
    """The length revision, stated in words, or None when the length is fine.

    Repair used to receive whatever sentence the auditor wrote about length.
    The auditor was reading a boolean, so it could only guess a direction, and
    a wrong guess costs a full writing-model call plus the minutes it takes.
    This sentence is computed from the same counts the check is, so it cannot
    disagree with the check that triggered it.
    """
    if _safe_bool(checks.get("target_word_count_met"), default=True):
        return None
    direction = _safe_str(checks.get("word_count_direction"))
    delta = _safe_int(checks.get("word_count_delta"), default=0)
    word_count = _safe_int(checks.get("word_count_estimate"), default=0)
    lower = _safe_int(checks.get("word_count_target_min"), default=0)
    upper = _safe_int(checks.get("word_count_target_max"), default=0)
    if direction not in {"over", "under"} or not delta or upper <= 0:
        return None

    # A handful of words either way is not worth a writing-model call. The Lima
    # run spent 11,119 output tokens regenerating 1,041 words to trim forty,
    # and the keep-best safety net that caught the worse result afterwards is
    # not the bug -- needing one was.
    #
    # Derived here rather than read off the checks so this function stays
    # self-sufficient: it already has everything the judgement needs, and a
    # caller that assembles checks by hand should not be able to lose the
    # threshold by omitting a key.
    if _severity(delta, lower, upper) != "large":
        return None

    # Rounded to the nearest ten. A writer asked for "363 words" treats the
    # number as a target to hit exactly and pads or truncates to reach it.
    amount = max(10, abs(delta) // 10 * 10)
    band = f"{lower}-{upper} words"
    if direction == "over":
        return (
            f"Length: the draft is {word_count} words, roughly {abs(delta)} over the "
            f"{band} required for this article. Cut about {amount} words. Tighten "
            "prose, remove repetition and merge overlapping passages. Do not drop "
            "a required subject, a section, or a sourced fact to make the count."
        )
    return (
        f"Length: the draft is {word_count} words, roughly {abs(delta)} under the "
        f"{band} required for this article. Add about {amount} words by developing "
        "material the draft already covers. Never add a fact the evidence records "
        "do not contain, and do not pad with restatement."
    )


# Words that mark a revision as being about how long the article is. Used to
# drop the auditor's own length sentence when the deterministic one exists:
# two length instructions in one list can point opposite ways, and that is the
# bug this whole path was built to remove.
_LENGTH_REVISION_TERMS = (
    "word count",
    "word target",
    "length",
    "expand",
    "lengthen",
    "shorten",
    "trim",
    "condense",
    "too short",
    "too long",
    "target_word_count",
)


def drop_length_revisions(revisions: list[str]) -> list[str]:
    """Remove revisions about length, keeping everything else in order.

    Only called when a computed length instruction is taking their place. The
    auditor is shown the direction now, but being shown it is not the same as
    obeying it, and a list holding both "cut about 360 words" and "expand the
    draft" leaves the repair model to pick. It picked wrong once already.
    """
    return [
        revision
        for revision in revisions
        if not any(term in revision.lower() for term in _LENGTH_REVISION_TERMS)
    ]


def _sanitize_coverage(parsed: dict[str, Any]) -> dict[str, Any]:
    missing_sections_raw = parsed.get("missing_sections")
    missing_sections: list[str] = []
    if isinstance(missing_sections_raw, list):
        missing_sections = [
            _safe_str(item) for item in missing_sections_raw if _safe_str(item)
        ]

    return {
        "coverage_sufficient": _safe_bool(
            parsed.get("coverage_sufficient"), default=False
        ),
        "analysis": _safe_str(parsed.get("analysis"))
        or "Coverage analysis not provided.",
        "missing_sections": missing_sections,
    }


def _sanitize_rewrite(
    parsed: dict[str, Any],
    *,
    fallback_title: str,
    fallback_content: str,
) -> dict[str, Any]:
    improvements_raw = parsed.get("improvements_applied")
    improvements = []
    if isinstance(improvements_raw, list):
        improvements = [_safe_str(item) for item in improvements_raw if _safe_str(item)]

    remaining_raw = parsed.get("remaining_gaps")
    remaining = []
    if isinstance(remaining_raw, list):
        remaining = [_safe_str(item) for item in remaining_raw if _safe_str(item)]

    improved_title = _clean_title(_safe_str(parsed.get("improved_title")))
    improved_content = _safe_str(parsed.get("improved_content"))
    # The source blocks handed to compose are labelled "Source 1:", "Source 2:"
    # so the model can tell them apart, and it cited them back into the prose.
    # The prompts now forbid that; this is the half that does not rely on the
    # model having listened.
    improved_title, title_citations = strip_source_citations(improved_title)
    improved_content, content_citations = strip_source_citations(improved_content)

    return {
        "improved_title": improved_title or _clean_title(fallback_title),
        "improved_content": improved_content or fallback_content,
        "guideline_alignment_summary": _safe_str(
            parsed.get("guideline_alignment_summary")
        )
        or "Guideline alignment summary not provided.",
        "improvements_applied": improvements,
        "remaining_gaps": remaining,
        "source_citations_removed": title_citations + content_citations,
    }


def _sanitize_quality(parsed: dict[str, Any]) -> dict[str, Any]:
    required_revisions_raw = parsed.get("required_revisions")
    required_revisions = []
    if isinstance(required_revisions_raw, list):
        required_revisions = [
            _safe_str(item) for item in required_revisions_raw if _safe_str(item)
        ]

    # Only the semantic checks are read from the auditor. Word count, paragraph
    # length, CTA and keyword presence are measured deterministically in
    # _build_constraint_checks and overwrite anything the model claims, so the
    # prompt no longer asks for them.
    checks_raw = _safe_dict(parsed.get("constraint_checks"))
    checks = {
        "audience_match": _safe_bool(checks_raw.get("audience_match"), default=True),
        "tone_match": _safe_bool(checks_raw.get("tone_match"), default=True),
        # The brief's own definition of failure, judged for the first time.
        # Deliberately not in HARD_CONSTRAINT_CHECK_KEYS: the line is freehand
        # and a badly worded one must not be able to block a run. It weighs
        # through the scores and the revisions the auditor writes beside it.
        "fails_if_avoided": _safe_bool(
            checks_raw.get("fails_if_avoided"), default=True
        ),
    }

    # A missing or unparseable score used to default to 6, which sits below the
    # repair threshold -- so a malformed audit response silently bought a full
    # article rewrite. Absent scores now default to neutral and are reported as
    # incomplete, and _should_run_repair ignores the score signal entirely when
    # the audit did not actually produce one.
    audit_complete = _safe_int(parsed.get("overall_score"), default=0) > 0

    def _score(key: str) -> int:
        return max(
            1, min(10, _safe_int(parsed.get(key), default=NEUTRAL_QUALITY_SCORE))
        )

    return {
        "audit_complete": audit_complete,
        "overall_score": _score("overall_score"),
        "guideline_coverage_score": _score("guideline_coverage_score"),
        "informativeness_score": _score("informativeness_score"),
        "originality_score": _score("originality_score"),
        "brief_adherence_score": _score("brief_adherence_score"),
        "seo_score": _score("seo_score"),
        "too_close_to_source": _safe_bool(
            parsed.get("too_close_to_source"), default=False
        ),
        "word_count_estimate": max(
            0, _safe_int(parsed.get("word_count_estimate"), default=0)
        ),
        "constraint_checks": checks,
        "required_revisions": required_revisions,
        "quality_summary": _safe_str(parsed.get("quality_summary"))
        or "Quality summary not provided.",
    }


def _sanitize_groundedness(parsed: dict[str, Any]) -> dict[str, Any]:
    """Normalise the grounding check.

    The audit scored `too_close_to_source`, the plagiarism direction. Nothing
    checked the opposite direction: claims in the draft that the sources do not
    support. For travel content -- visa rules, prices, safety guidance -- that
    is the more consequential failure.
    """
    claims_raw = parsed.get("unsupported_claims")
    claims: list[dict[str, str]] = []
    if isinstance(claims_raw, list):
        for item in claims_raw:
            record = _safe_dict(item)
            claim = _safe_str(record.get("claim"))
            if not claim:
                continue
            severity = _safe_str(record.get("severity")).lower()
            claims.append(
                {
                    "claim": claim,
                    "reason": _safe_str(record.get("reason")) or "Reason not stated.",
                    "severity": "high" if severity == "high" else "low",
                }
            )

    high_severity = [claim for claim in claims if claim["severity"] == "high"]
    return {
        "checked": True,
        "grounded": not high_severity,
        "assessment": _safe_str(parsed.get("assessment"))
        or "Grounding assessment not provided.",
        "unsupported_claims": claims,
        "high_severity_count": len(high_severity),
    }


def unchecked_groundedness() -> dict[str, Any]:
    """Result used when the grounding check could not run.

    Treated as grounded so a checker outage degrades the signal rather than
    blocking the run, but recorded as unchecked so it is visible.
    """
    return {
        "checked": False,
        "grounded": True,
        "assessment": "Grounding check did not run.",
        "unsupported_claims": [],
        "high_severity_count": 0,
    }


def looks_truncated(content: str, *, max_output_tokens: int) -> bool:
    """Did the model stop, or did the transport cut it off? (#432, A17)

    Output is capped, and a response that hit the cap is a transport failure,
    not a writing one. Repairing it as though the writer chose to stop early
    asks the wrong model to fix the wrong thing -- and the fix for a cap is a
    higher cap or a shorter plan, neither of which repair can do.

    Judged on two signals together, because either alone is noisy: the text is
    close to what the cap allows, and it does not end like finished prose.
    """
    if not content or max_output_tokens <= 0:
        return False
    # Four characters to a token, near enough to spot a ceiling.
    near_cap = len(content) >= max_output_tokens * 4 * 0.92
    stripped = content.rstrip()
    ends_cleanly = stripped.endswith((".", "!", "?", '"', "'", ")", "`"))
    return near_cap and not ends_cleanly


def _should_run_repair(quality: dict[str, Any], checks: dict[str, Any]) -> bool:
    # Only trust the score when the auditor actually returned one.
    if _safe_bool(quality.get("audit_complete"), default=True):
        if quality.get("overall_score", NEUTRAL_QUALITY_SCORE) < REPAIR_SCORE_THRESHOLD:
            return True
    if _safe_bool(quality.get("too_close_to_source"), default=False):
        return True

    for key in HARD_CONSTRAINT_CHECK_KEYS:
        if not _safe_bool(checks.get(key), default=True):
            return True

    return False
