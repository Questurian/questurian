"""Remove the source scaffolding from reader-facing prose.

`_format_raw_sources` labels each source block `Source 1:`, `Source 2:` so the
model can tell them apart. Nothing ever told the model those labels were
internal, while the compose, supplement and repair prompts told it six ways to
stay faithful to the sources -- so it cited them, and articles shipped with
"(Source 3)" sitting in the middle of a sentence.

The prompts now say not to. This is the half that does not depend on the model
having listened.
"""

from __future__ import annotations

import re

_SOURCE_REF = r"sources?\s*[:#]?\s*\d+(?:\s*(?:,|;|&|and|to|-|--)\s*(?:sources?\s*[:#]?\s*)?\d+)*"

# "(Source 1)", "[Sources 2, 3]", "(see source 4)", "(Source 1 and Source 2)".
_BRACKETED_CITATION = re.compile(
    rf"[ \t]*[(\[]\s*(?:see|per|from|cf\.?)?\s*{_SOURCE_REF}\s*[)\]]",
    re.IGNORECASE,
)

# A bare "Source 2:" heading or line: the scaffolding echoed back verbatim.
_SCAFFOLD_LINE = re.compile(
    r"(?im)^[ \t]*#{0,6}[ \t]*\*{0,2}sources?[ \t]+\d+\*{0,2}[ \t]*:?[ \t]*$\n?"
)

# "...runs between US$1,300 and US$1,600, according to Source 1." The trailing
# form is what run 58766c27 shipped most of. The comma in front goes with it,
# or the sentence ends on a dangling clause. The lookbehind keeps this off a
# sentence-opening "According to Source 2, ...", which the clause pattern
# below handles because that one has to re-capitalise what follows.
_TRAILING_ATTRIBUTION = re.compile(
    rf"""
    (?<=[\w)\]"'])
    \s*,?\s*
    (?:according\s+to|as\s+(?:stated|noted|reported|described)\s+(?:in|by)|per)
    \s+{_SOURCE_REF}
    (?=\s*[.!?,;:)\]]|\s*$)
    """,
    re.IGNORECASE | re.VERBOSE | re.MULTILINE,
)

# "According to Source 2, the temple opens at nine." The whole clause has to
# go, and the word after it has to be re-capitalised when the clause was what
# opened the sentence -- otherwise stripping the citation leaves prose that
# reads worse than the citation did.
_ATTRIBUTION_CLAUSE = re.compile(
    rf"""
    (?P<lead>^|(?<=[.!?][ ])|(?<=[.!?][\n])|(?<=,[ ]))
    (?:according\s+to|as\s+(?:stated|noted|reported|described)\s+(?:in|by)|as|per)
    \s+{_SOURCE_REF}
    (?:\s*(?:notes?|states?|says?|reports?|explains?))?
    \s*,?\s*
    (?P<next>[A-Za-z])
    """,
    re.IGNORECASE | re.VERBOSE | re.MULTILINE,
)

_SPACE_BEFORE_PUNCTUATION = re.compile(r"[ \t]+([.,;:!?)\]])")
_DOUBLED_SPACES = re.compile(r"[ \t]{2,}")
_SPACE_AT_LINE_END = re.compile(r"(?m)[ \t]+$")
_SPACE_AT_LINE_START = re.compile(r"(?m)^[ \t]+(?=\S)")
# Lifting a scaffold line out of the middle of a section leaves a gap.
_BLANK_LINE_RUN = re.compile(r"\n{3,}")

# Anything still naming a numbered source after the removals above. Reported,
# not deleted: an unrecognised citation shape is worth seeing in the trace
# rather than being guessed at with a blunter pattern.
_RESIDUAL_SOURCE_MENTION = re.compile(r"\bsources?\s*[:#]?\s*\d+\b", re.IGNORECASE)


def _restore_sentence_case(match: re.Match[str]) -> str:
    following = match.group("next")
    # The clause opened the sentence, so the word that followed now does.
    return match.group("lead") + following.upper()


def strip_source_citations(text: str) -> tuple[str, int]:
    """Return the prose without source citations, and how many were removed.

    The count is reported rather than swallowed: a model that keeps citing
    after being told not to is worth seeing in the trace.
    """
    if not text:
        return "", 0

    # Trailing first: a leading-clause match would consume the word after it,
    # and the trailing form ends on punctuation rather than a word.
    text, trailing = _TRAILING_ATTRIBUTION.subn("", text)
    text, attributions = _ATTRIBUTION_CLAUSE.subn(_restore_sentence_case, text)
    text, bracketed = _BRACKETED_CITATION.subn("", text)
    text, scaffold = _SCAFFOLD_LINE.subn("", text)
    removed = trailing + attributions + bracketed + scaffold

    if removed:
        text = _SPACE_BEFORE_PUNCTUATION.sub(r"\1", text)
        text = _DOUBLED_SPACES.sub(" ", text)
        text = _SPACE_AT_LINE_END.sub("", text)
        text = _SPACE_AT_LINE_START.sub("", text)
        text = _BLANK_LINE_RUN.sub("\n\n", text)
    return text, removed


def count_residual_source_mentions(text: str) -> int:
    return len(_RESIDUAL_SOURCE_MENTION.findall(text or ""))
