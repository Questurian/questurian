"""Count banned-phrase hits across a batch of blurbs for the dining pilot.

Usage:
    python3 scripts/count_ai_tells.py path/to/blurbs.txt
    python3 scripts/count_ai_tells.py blurbs_baseline.txt blurbs_postchange.txt

Each input file: one blurb per record, separated by a line containing only "---".

Reports per-pattern hit counts and totals. Stopping rule per the rollout plan:
roll to other categories if (post-change total / baseline total) <= 0.30.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("quietly [adj]",        re.compile(r"\bquietly\s+\w+", re.I)),
    ("what/where X meets Y", re.compile(r"\b(?:what happens when|where)\s+\w[\w\s]*?\s+meets\s+\w", re.I)),
    ("between X and Y bridge", re.compile(r"\b(?:what happens between|the space between)\s+\w[\w\s]*?\s+and\s+\w", re.I)),
    ("X territory",          re.compile(r"\b\w+\s+territory\b\.?\s*$", re.I | re.M)),
    ("not just X, it's Y",   re.compile(r"\bnot just\b.{1,40}?\b(?:it'?s|but)\b", re.I)),
    ("more than just a",     re.compile(r"\bmore than just a\b", re.I)),
    ("in a world where",     re.compile(r"\bin a world where\b", re.I)),
    ("feels both X and Y",   re.compile(r"\b(?:feels|reads as) both\b", re.I)),
    ("masterclass in",       re.compile(r"\b(?:a )?masterclass in\b", re.I)),
    ("punches above",        re.compile(r"\bpunches above its weight\b", re.I)),
    ("the kind of X that",   re.compile(r"\bthe kind of \w+(?:\s+\w+){0,3}\s+that\b", re.I)),
    ("deceptively simple",   re.compile(r"\bdeceptively\s+\w+", re.I)),
    ("effortlessly [adj]",   re.compile(r"\beffortlessly\s+\w+", re.I)),
    ("set/raise the bar",    re.compile(r"\b(?:sets?|raises?) the bar\b", re.I)),
    ("move the needle",      re.compile(r"\bmoves? the needle\b", re.I)),
    ("speaks volumes/to",    re.compile(r"\bspeaks (?:volumes|to)\b", re.I)),
    ("at its core / heart",  re.compile(r"\bat (?:its core|the heart of)\b", re.I)),
    ("testament to",         re.compile(r"\btestament to\b", re.I)),
    ("hedges",               re.compile(r"\b(?:arguably|perhaps|somewhat|fairly|genuinely|truly|simply|of course|indeed)\b", re.I)),
    ("meta phrasing",        re.compile(r"\bit'?s (?:worth noting|important to remember)\b", re.I)),
    ("3-adjective list",     re.compile(r"\b\w+ly?\b,\s*\w+ly?\b,?\s*and\s+\w+ly?\b", re.I)),
    ("latinate: utilize",    re.compile(r"\butiliz[ei]\w*\b", re.I)),
    ("latinate: leverage",   re.compile(r"\bleverag\w*\b", re.I)),
    ("latinate: curate",     re.compile(r"\bcurat\w*\b", re.I)),
    ("latinate: elevate",    re.compile(r"\belevat\w*\b", re.I)),
    ("latinate: showcase",   re.compile(r"\bshowcas\w*\b", re.I)),
    ("latinate: highlight",  re.compile(r"\bhighlight\w*\b", re.I)),
    ("personified menu",     re.compile(r"\b(?:menu|menus|room|rooms|flavor|flavors)\b[^.]{0,40}\b(?:moves?|dances?|weaves?|sings?|whispers?|breathes?|converses?)\b", re.I)),
    ("in conclusion",        re.compile(r"\b(?:in conclusion|ultimately|all in all)\b", re.I)),
    ("X rather than Y",      re.compile(r"\b\w+(?:\s+\w+){0,4}\s+rather than\s+\w+", re.I)),
    ("not X but Y",          re.compile(r"\bnot\s+\w[\w\s]{1,30}?\s+but\s+\w", re.I)),
    ("which is why",         re.compile(r",\s+which is why\b", re.I)),
    ("[noun]-forward/-led",  re.compile(r"\b\w+-(?:forward|led|driven|leaning|forward[- ]thinking)\b", re.I)),
    ("clipped imperative closer", re.compile(r"(?:^|\.\s+|,\s+and\s+)(?:book|reserve|order|go|bring|skip|arrive|sit|come|treat|stay)\s+[^.]{1,60}\.\s*$", re.M | re.I)),
    ("most/-est you can Y",      re.compile(r"\bthe\s+(?:most\s+\w+|\w+(?:est|iest))\b\s+(?:\w+\s+){0,4}?you can\s+\w+", re.I)),
    ("aphoristic two-clause",    re.compile(r"\b\w+\s+is\s+(?:the|a|an)\s+\w[\w\s]{1,40}?\s*(?:;|,\s+and)\s+\w+\s+is\s+(?:the|a|an)\s+\w[\w\s]{1,40}?[.;]", re.I)),
    ("vague superlative + abstract noun", re.compile(r"\b(?:smartest|sharpest|finest|deepest|tightest|cleanest|leanest|most\s+(?:thoughtful|considered|committed|deliberate|disciplined))\s+\w+(?:\s+\w+){0,4}?\s+(?:program|programs|list|lists|cellar|cellars|room|rooms|kitchen|kitchens|menu|menus|pairing|pairings|tasting)\b", re.I)),
    ("deserves its own X",   re.compile(r"\bdeserves its own\s+\w+", re.I)),
    ("earn(s) its (seat|place)", re.compile(r"\bearn(?:s|ed|ing)?\s+its\s+(?:seat|place|spot|stripes)\b", re.I)),
    ("noun triad (A, B, and C)", re.compile(r"\b\w+,\s+\w+(?:\s+\w+){0,2},?\s+and\s+\w+", re.I)),
    ("X, not Y contrastive",  re.compile(r",\s+not\s+(?:a|an|the)\s+\w[\w\s-]{1,40}?(?:[.,;]|$)", re.I)),
    ("for a reason closer",   re.compile(r"\bfor a reason\b", re.I)),
    ("the X to chase/want/beat", re.compile(r"\bthe\s+\w+\s+to\s+(?:chase|want|beat|know|catch|book|grab)\b", re.I)),
    ("X-er than Y suggests",  re.compile(r"\b\w+er\s+than\s+\w[\w\s]{0,20}?\s+(?:suggests?|implies|lets on|would)\b", re.I)),
    ("food does the talking", re.compile(r"\b(?:doing|does|do)\s+(?:most of\s+)?the\s+(?:talking|work|heavy lifting)\b", re.I)),
    ("dishes argue/make case", re.compile(r"\b(?:arguing|argues|argue|making the case|makes the case|speak(?:s|ing)? for (?:itself|themselves))\b", re.I)),
]


def split_records(text: str) -> list[str]:
    parts = [p.strip() for p in re.split(r"(?m)^---\s*$", text) if p.strip()]
    return parts


def count_file(path: Path) -> tuple[int, dict[str, int], int]:
    records = split_records(path.read_text())
    counts: dict[str, int] = {label: 0 for label, _ in PATTERNS}
    for record in records:
        for label, pattern in PATTERNS:
            counts[label] += len(pattern.findall(record))
    return len(records), counts, sum(counts.values())


def report(label: str, n: int, counts: dict[str, int], total: int) -> None:
    print(f"\n=== {label} — {n} blurbs ===")
    for k, v in sorted(counts.items(), key=lambda x: -x[1]):
        if v:
            print(f"  {v:4d}  {k}")
    print(f"  ----")
    print(f"  {total:4d}  TOTAL hits  ({total / max(n, 1):.2f} per blurb)")


def main(argv: list[str]) -> int:
    if len(argv) not in (2, 3):
        print(__doc__)
        return 1
    a_n, a_counts, a_total = count_file(Path(argv[1]))
    report(f"file: {argv[1]}", a_n, a_counts, a_total)
    if len(argv) == 3:
        b_n, b_counts, b_total = count_file(Path(argv[2]))
        report(f"file: {argv[2]}", b_n, b_counts, b_total)
        if a_total:
            ratio = b_total / a_total
            print(f"\nReduction: {(1 - ratio) * 100:.1f}%  (stopping rule: >=70%)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
