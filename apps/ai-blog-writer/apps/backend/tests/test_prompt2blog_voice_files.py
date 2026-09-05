"""Invariants for the two voice files.

There used to be three brand voices and six tones, concatenated into the same
style block. The same bad instruction lived in three copies: an unconfirmed
detail was "either attributed in the sentence or cut", which produced four
named publications in the Lima food article while the house rules and the voice
rules both banned exactly that. Fixing one copy left two live.

ADR 0032 collapsed all of it to one voice plus one set of writing conventions,
which removes that failure mode structurally rather than by vigilance. These
tests pin what the collapse must not lose.
"""

from __future__ import annotations

from app.features.prompt2blog.config import (
    PROMPT2BLOG_VOICE_FILE,
    PROMPT2BLOG_WRITING_CONVENTIONS_FILE,
)


def _voice() -> str:
    return PROMPT2BLOG_VOICE_FILE.read_text(encoding="utf-8")


def _conventions() -> str:
    return PROMPT2BLOG_WRITING_CONVENTIONS_FILE.read_text(encoding="utf-8")


def test_both_voice_files_exist():
    # Everything the outline and compose stages are given about register comes
    # from these two files. A missing one is silent: the prompt simply has less
    # in it, and the draft reads like nothing in particular.
    assert PROMPT2BLOG_VOICE_FILE.exists()
    assert PROMPT2BLOG_WRITING_CONVENTIONS_FILE.exists()


def test_the_two_files_do_not_share_an_id():
    # `data/prompt2blog/house-rules.md` is a different document -- the
    # pipeline's authority order and completion standard -- and it is loaded by
    # id. A second file claiming `house-rules` would pass that loader's check
    # and silently substitute, which is the collision this naming avoids.
    assert "id: questurian-voice" in _voice()
    assert "id: writing-conventions" in _conventions()
    assert "id: house-rules" not in _conventions()


def test_the_voice_wins_over_the_conventions():
    """The old rulebook said the opposite, and that is why the register never
    recovered: a mechanical convention could force a sentence that read wrong.
    """
    body = " ".join(_conventions().lower().split())
    assert "the voice wins" in body


def test_neither_file_asks_the_writer_to_name_a_source():
    banned = ("attributed in the sentence", "according to", "sources report")
    for name, text in (("voice", _voice()), ("conventions", _conventions())):
        body = text.lower()
        for phrase in banned:
            if phrase not in body:
                continue
            index = body.find(phrase)
            window = body[max(0, index - 120) : index]
            assert any(
                marker in window for marker in ("no ", "never", "cut,", "banned")
            ), f'{name} still asks for "{phrase}"'


def test_the_conventions_cut_rather_than_attribute_an_unconfirmed_detail():
    body = _conventions().lower()
    assert "cut" in body
    assert "publication" in body or "outlet" in body


def test_the_voice_says_what_a_good_piece_is_rather_than_only_what_is_banned():
    """The whole diagnosis: 41 prohibitions and not one sentence describing what
    a good piece is. A voice file that is only bans has regressed to the thing
    it replaced.
    """
    body = _voice()
    positives = ("It treats you", "Its warmth", "It has a view")
    assert all(phrase in body for phrase in positives)


def test_the_anti_ai_enforcement_pass_is_still_wired_in():
    """ADR 0032 said this was dropped for Prompt2Blog. It never was.

    The pass is what removes "mosaic-covered" and "six-month" from a draft
    before anyone sees it, and it stopped working once already when the model
    gateway migration left these calls without a job id. If it is ever removed
    deliberately, amend ADR 0032 again and delete this test in the same change
    -- do not delete it to make a cleanup pass go green.
    """
    from pathlib import Path

    stages = Path(__file__).resolve().parents[1] / "app/features/prompt2blog/stages/v3"
    compose = (stages / "compose.py").read_text()
    repair = (stages / "audit_repair.py").read_text()

    assert "enforce_anti_ai(" in compose
    assert "enforce_anti_ai(" in repair
    # And each still names its job, which is what broke in 3bdaef2f.
    for source in (compose, repair):
        call = source.split("enforce_anti_ai(", 1)[1].split("\n    )", 1)[0]
        assert "job_id=" in call
