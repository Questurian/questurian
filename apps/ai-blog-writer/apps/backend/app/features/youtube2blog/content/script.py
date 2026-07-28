"""Writing-script measurements shared by Stage 1 cleaning and its quality gate.

Stage 1 translates as it cleans, so two separate decisions need to know whether
a piece of text is written in a non-Latin script: whether a cleaning pass
actually performed the translation it was told to, and whether character-count
retention means anything for the transcript it just produced.
"""

from __future__ import annotations

import re

# Scripts that cannot survive a successful translation to English. Latin-script
# languages are deliberately not detected: every cleaning prompt already orders
# a translation, and any heuristic strong enough to catch untranslated Spanish
# would also fire on English text carrying loanwords or accented names.
NON_LATIN_SCRIPT_PATTERN = re.compile(
    "["
    "Ѐ-ӿ"  # Cyrillic
    "֐-׿"  # Hebrew
    "؀-ۿ"  # Arabic
    "ऀ-ॿ"  # Devanagari
    "฀-๿"  # Thai
    "぀-ヿ"  # Hiragana and Katakana
    "一-鿿"  # CJK unified ideographs
    "가-힯"  # Hangul
    "]"
)

# A stray quoted term in an otherwise English article should not count as a
# different script. Genuinely non-Latin text runs near 100%; prose that merely
# names a place or dish in its own script sits under 5%. 10% separates the two
# with room for partly-translated text to still be caught.
NON_LATIN_SCRIPT_RATIO_THRESHOLD = 0.10


def non_latin_script_ratio(text: str) -> float:
    """Share of the text's non-whitespace characters written in a non-Latin script."""
    dense = "".join(text.split())
    if not dense:
        return 0.0
    return len(NON_LATIN_SCRIPT_PATTERN.findall(text)) / len(dense)


def is_non_latin_script(text: str) -> bool:
    """True when enough of the text is non-Latin to treat it as another script."""
    return non_latin_script_ratio(text) > NON_LATIN_SCRIPT_RATIO_THRESHOLD
