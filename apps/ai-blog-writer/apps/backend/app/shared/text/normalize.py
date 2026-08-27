"""Shared text normalizers and anti-AI-tell validation for generated output."""

from __future__ import annotations

from dataclasses import dataclass
import logging
import re
from collections.abc import Callable

logger = logging.getLogger(__name__)

_DASH_SUB_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\s*(?:—|--)\s*"), ", "),
    (re.compile(r"(?<!\d)\s*–\s*(?!\d)"), ", "),
)

_DOUBLE_COMMA = re.compile(r",\s*,")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([.,;:!?])")


def normalize_dashes(text: str) -> str:
    for pattern, replacement in _DASH_SUB_PATTERNS:
        text = pattern.sub(replacement, text)
    text = _DOUBLE_COMMA.sub(",", text)
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)
    return text


_HAS_WORD_CHAR = re.compile(r"[A-Za-z0-9]")
_FENCE_LINE = re.compile(r"^\s*(```|~~~)")
_TABLE_DELIMITER_ROW = re.compile(
    r"^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$"
)
_HORIZONTAL_RULE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
_DOUBLE_HYPHEN_PROSE = re.compile(r"(?<=\w)\s*--\s*(?=\w)")
# Banning the em dash without banning its replacements just moves the tell.
# The comma-bracketed aside was the first substitution and is caught below;
# a spaced single hyphen ("the room is warm - and quietly so") is the next
# one, and reads as a typewriter dash rather than as punctuation anyone
# chose. Digit-digit spans are excluded: those are ranges, not dashes.
_SPACED_HYPHEN_PROSE = re.compile(r"(?<=[A-Za-z,;:])\s+-\s+(?=[A-Za-z])")

# Spans where a hyphen is syntax or data rather than a writer's choice, blanked
# before the compound check reads a line.
_NON_PROSE_SPANS = (
    re.compile(r"`[^`]*`"),
    re.compile(r"\]\([^)]*\)"),
    re.compile(r"https?://\S+"),
    re.compile(r"\[![^\]]*\]"),
    re.compile(r"<[^>]+>"),
)

# Hyphenated compounds. A run of them is a strong AI tell -- "one-bedroom",
# "long-stay", "well-known", "cost-of-living" stacked through an article read
# as generated even though each word is correct English. House style is none:
# rephrase, and a human adds one back if the sentence really needs it.
_HYPHENATED_COMPOUND = re.compile(r"\b[A-Za-z]+(?:-[A-Za-z]+)+\b")

# ...except proper nouns, where the hyphen is part of the name and rewriting it
# corrupts a fact. "Aix-en-Provence" and "Colombia-Peru" keep theirs;
# "Two-bedroom" at the start of a sentence does not, because only its first
# letter is capitalised.


def _is_proper_noun_compound(word: str) -> bool:
    return any(part[:1].isupper() for part in word.split("-")[1:])


def _hyphenated_compounds(line: str) -> list[str]:
    for pattern in _NON_PROSE_SPANS:
        line = pattern.sub(" ", line)
    return [
        word
        for word in _HYPHENATED_COMPOUND.findall(line)
        if not _is_proper_noun_compound(word)
    ]


_COMMA_AS_DASH_ASIDE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r",\s+(?:and\s+)?quietly\s+so\s*,", re.I),
    re.compile(r",\s+convincingly\s*,", re.I),
    re.compile(r",\s+barely\s+[^,\n]{2,80}\s*,", re.I),
    re.compile(
        r",\s+(?:perhaps|arguably|somewhat|rather|quite|truly|really|simply|just)\s*,",
        re.I,
    ),
)


# Sourcing language. The house rule is that attribution lives in the evidence
# record and never in the prose, but until now nothing checked it: the Lima food
# article shipped "Travel sources report", "Outlets anticipate", "One outlet
# framed", and "The publication noted" past a clean validation run.
#
# Only high-confidence shapes are listed. A named actor ("PromPerú confirmed",
# "the mayor said") is the story and must not match; what matters is the
# anonymous publication standing between the writer and the claim. "the report"
# matches, "the OSITRAN report" does not, because the intervening proper noun
# means the document is being named rather than hidden behind.
_ATTRIBUTION_NOUN = (
    r"(?:sources?|outlets?|publications?|reports?|reporting|coverage|"
    r"journalists?|media|stud(?:y|ies))"
)
_ATTRIBUTION_VERB = (
    r"(?:reports?|reported|says?|said|notes?|noted|anticipates?|anticipated|"
    r"suggests?|suggested|indicates?|indicated|claims?|claimed|frames?|framed|"
    r"describes?|described|cites?|cited|confirms?|confirmed|warns?|warned|"
    r"predicts?|predicted|expects?|expected)"
)
_SOURCE_ATTRIBUTION_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(
            rf"\b(?:travel|industry|local|official|news|multiple|several|some|"
            rf"various)?\s*{_ATTRIBUTION_NOUN}\s+{_ATTRIBUTION_VERB}\b",
            re.I,
        ),
        "an unnamed publication is credited with the claim",
    ),
    (
        re.compile(
            r"\b(?:the|one|another)\s+"
            r"(?:outlet|publication|report|article|paper)\b",
            re.I,
        ),
        "the prose points at a source instead of stating the fact",
    ),
    (re.compile(r"\baccording to\b", re.I), '"according to" is sourcing language'),
    (
        re.compile(
            rf"\bas\s+{_ATTRIBUTION_NOUN}\s+(?:have\s+)?{_ATTRIBUTION_VERB}\b", re.I
        ),
        "an unnamed publication is credited with the claim",
    ),
)


def _source_attributions(line: str) -> list[str]:
    for pattern in _NON_PROSE_SPANS:
        line = pattern.sub(" ", line)
    found: list[str] = []
    for pattern, reason in _SOURCE_ATTRIBUTION_PATTERNS:
        match = pattern.search(line)
        if match:
            found.append(f"{match.group(0).strip()} ({reason})")
    return found


@dataclass(frozen=True)
class AntiAiValidationResult:
    valid: bool
    errors: list[str]


def normalize_dashes_markdown(text: str) -> str:
    """Dash normalization for markdown documents.

    Applies normalize_dashes line by line while leaving structural markdown
    intact: fenced code blocks, and lines with no letters or digits
    (horizontal rules, frontmatter delimiters, table separator rows), whose
    hyphens are syntax rather than prose dashes.
    """
    lines = text.split("\n")
    in_fence = False
    result: list[str] = []
    for line in lines:
        if _FENCE_LINE.match(line):
            in_fence = not in_fence
            result.append(line)
            continue
        if in_fence or not _HAS_WORD_CHAR.search(line):
            result.append(line)
            continue
        result.append(normalize_dashes(line))
    return "\n".join(result)


def _iter_markdown_prose_lines(text: str) -> list[tuple[int, str]]:
    lines = text.split("\n")
    in_fence = False
    prose_lines: list[tuple[int, str]] = []
    for index, line in enumerate(lines, start=1):
        if _FENCE_LINE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if not _HAS_WORD_CHAR.search(line):
            continue
        if _HORIZONTAL_RULE.match(line) or _TABLE_DELIMITER_ROW.match(line):
            continue
        prose_lines.append((index, line))
    return prose_lines


def _has_non_numeric_en_dash(line: str) -> bool:
    for match in re.finditer("–", line):
        before = line[: match.start()].rstrip()
        after = line[match.end() :].lstrip()
        if not before or not after:
            return True
        if not before[-1].isdigit() or not after[0].isdigit():
            return True
    return False


def validate_anti_ai_tells_markdown(text: str) -> AntiAiValidationResult:
    """Validate anti-AI output without rewriting cadence.

    Ignores markdown structure where dashes are syntax: fenced code, horizontal
    rules, table delimiter rows, and numeric en-dash ranges.
    """
    errors: list[str] = []
    for line_number, line in _iter_markdown_prose_lines(text):
        if "—" in line:
            errors.append(f"Line {line_number}: em dash is not allowed.")
        if _DOUBLE_HYPHEN_PROSE.search(line):
            errors.append(
                f"Line {line_number}: prose double hyphen dash is not allowed."
            )
        if _SPACED_HYPHEN_PROSE.search(line):
            errors.append(
                f"Line {line_number}: spaced hyphen used as a dash is not allowed."
            )
        compounds = _hyphenated_compounds(line)
        if compounds:
            listed = ", ".join(sorted(set(compounds))[:8])
            errors.append(
                f"Line {line_number}: hyphenated compounds are not allowed: {listed}"
            )
        if _has_non_numeric_en_dash(line):
            errors.append(f"Line {line_number}: non-numeric en dash is not allowed.")
        attributions = _source_attributions(line)
        if attributions:
            errors.append(
                f"Line {line_number}: attribution belongs in the evidence "
                f"record, not the prose: {'; '.join(attributions)}"
            )
        for pattern in _COMMA_AS_DASH_ASIDE_PATTERNS:
            match = pattern.search(line)
            if match:
                errors.append(
                    f"Line {line_number}: comma-bracketed aside looks like dash cadence: "
                    f"{match.group(0).strip()}"
                )
                break
    return AntiAiValidationResult(valid=not errors, errors=errors)


def build_anti_ai_repair_prompt(content: str, errors: list[str]) -> str:
    error_lines = "\n".join(f"- {error}" for error in errors[:20])
    return (
        "Your previous output violated the anti-AI voice rules.\n"
        "Repair only the listed issues. Preserve markdown, facts, headings, tables, "
        "and source meaning. Do not replace dashes with comma-bracketed asides; "
        "rewrite affected sentences into clean prose. Fix a hyphenated compound "
        "by rephrasing the sentence, never by deleting the hyphen or splitting "
        "the word in place. Fix sourcing language by stating the fact as a "
        "plain sentence and deleting the publication, not by swapping in "
        "another attribution verb; if the fact cannot stand without a source "
        "named in the sentence, delete the sentence.\n\n"
        f"Validation errors:\n{error_lines}\n\n"
        "Previous output:\n"
        "<<<CONTENT>>>\n"
        f"{content}\n"
        "<<<END_CONTENT>>>\n\n"
        "Return only the repaired markdown. No JSON, no commentary."
    )


def enforce_anti_ai_tells_markdown(
    text: str,
    *,
    repair: Callable[[str], str] | None = None,
    context: str = "anti-ai output",
) -> str:
    """Validate generated markdown and optionally retry once with targeted repair."""
    candidate = text.strip()
    result = validate_anti_ai_tells_markdown(candidate)
    if result.valid or repair is None:
        if not result.valid:
            logger.warning("%s failed anti-AI validation: %s", context, result.errors)
        return candidate

    repair_prompt = build_anti_ai_repair_prompt(candidate, result.errors)
    repaired = str(repair(repair_prompt)).strip()
    if not repaired:
        logger.warning(
            "%s anti-AI repair returned empty output; keeping original", context
        )
        return candidate

    repaired_result = validate_anti_ai_tells_markdown(repaired)
    if not repaired_result.valid:
        logger.warning(
            "%s anti-AI repair still invalid: %s", context, repaired_result.errors
        )
    return repaired
