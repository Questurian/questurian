"""Choosing which reviews are worth the page, and in which words to ask.

Buying twenty reviews and handing all twenty to the extraction is shovelling,
not research. These tests are about the two things that make it selection: the
words the subject is actually written about in, taken from the run's own data,
and an order that puts the reviews about the subject in front of the reviews
about the parking.

The sharpest test here is the one that came from a real mistake. The first
version of this module *filtered* on the derived terms, and terms are derived,
so a run whose terms came out narrow silently destroyed real material and
produced no page at all. Subject now decides the order and never survival.

Nothing here reaches the network or a model.
"""

from __future__ import annotations

from app.features.listicle_pipeline import review_selection


def review(text: str, *, who: str = "R", count: int = 0, level: int = 0) -> dict:
    return {
        "author_name": who,
        "rating": 4,
        "review_text": text,
        "author_review_count": count,
        "author_local_guide_level": level,
    }


def render(item: dict) -> str:
    return f"REVIEW by {item['author_name']}\n{item['review_text']}"


WINGS = "Las alitas acevichadas estaban excelentes y bien picantes."
PARKING = (
    "El estacionamiento es complicado en esta zona de Miraflores, y tardamos "
    "casi media hora en encontrar un sitio cerca del local un sabado."
)


# ---------------------------------------------------------------------------
# The words to ask in
# ---------------------------------------------------------------------------


def test_the_subject_words_come_from_the_runs_own_searches(isolated_db):
    """No translation table and no model call.

    The list's topic is "chicken wings" and every review of it is in Spanish.
    Nothing here knows that. It knows what this run's own search evidence said,
    which is `alitas`, because that is the word the sentences that put these
    places on the board actually used.
    """
    import json

    from app.core.database import get_db_connection, transaction

    payload = {
        "candidates": [
            {"evidence": "reinas del sabor criollo en forma de alitas"},
            {"evidence": "gran variedad de alitas, 13 tipos de salsas"},
            {"evidence": "sus alitas picantes son famosas en el barrio"},
            {"evidence": "un bar de cerveza artesanal en Miraflores"},
        ]
    }
    with transaction() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS listicle_search_results ("
            "run_id TEXT PRIMARY KEY, payload TEXT, created_at TEXT, updated_at TEXT)"
        )
        conn.execute(
            "INSERT INTO listicle_search_results (run_id, payload) VALUES (?, ?)",
            ("run-1", json.dumps(payload)),
        )

    terms = review_selection.subject_terms("run-1")

    assert "alitas" in terms
    # A word under one candidate is that candidate's, not the list's subject.
    assert "cerveza" not in terms
    assert "artesanal" not in terms
    with get_db_connection() as conn:
        pass


def test_a_run_with_no_stored_searches_yields_no_terms(isolated_db):
    """A real answer, not a failure. The caller then buys unfiltered reviews
    rather than filtering on a guess."""
    assert review_selection.subject_terms("nothing-here") == []


def test_the_topic_label_fills_in_when_the_evidence_cannot(isolated_db):
    terms = review_selection.subject_terms("nothing-here", topic_label="chicken wings")

    assert terms == ["chicken", "wings"]


# ---------------------------------------------------------------------------
# Which reviews are worth the page
# ---------------------------------------------------------------------------


def test_a_review_about_the_subject_beats_a_longer_one_about_the_parking(isolated_db):
    """The whole point. A list about wings is written from the reviews about
    wings, however well somebody wrote about the car park."""
    chosen = review_selection.select(
        [review(PARKING, count=400, level=9), review(WINGS)],
        terms=["alitas"],
        budget_chars=120,
        render=render,
    )

    assert len(chosen.kept) == 1
    assert chosen.kept[0]["review_text"] == WINGS
    assert chosen.on_topic == 1


def test_a_wrong_subject_word_costs_a_review_its_place_not_its_existence(isolated_db):
    """The bug this module was rewritten for.

    The terms are derived from stored evidence, so they can come out narrow or
    plain wrong. When they do, every real review looks off-topic. Filtering on
    that deleted the material and produced no page -- a place with opinions
    read as a place with none.
    """
    chosen = review_selection.select(
        [review(WINGS), review("Buen ambiente, volveria por la comida.")],
        # Terms that match neither review.
        terms=["cebiche", "pescado"],
        budget_chars=12_000,
        render=render,
    )

    assert len(chosen.kept) == 2, "a wrong term must not delete real reviews"
    assert chosen.on_topic == 0


def test_a_rating_with_punctuation_is_not_evidence(isolated_db):
    """The one thing refused outright: too few words to carry a passage that
    a check could stand on."""
    chosen = review_selection.select(
        [review("Muy bueno."), review("👍"), review(WINGS)],
        terms=["alitas"],
        budget_chars=12_000,
        render=render,
    )

    assert len(chosen.kept) == 1
    assert chosen.too_short == 2


def test_a_star_rating_with_no_words_is_counted_apart_from_a_short_one(isolated_db):
    """They cost the same quota and they are different facts about a place."""
    chosen = review_selection.select(
        [{"review_text": None}, {"review_text": "   "}, review("Bueno."), review(WINGS)],
        terms=["alitas"],
        budget_chars=12_000,
        render=render,
    )

    assert chosen.bought == 4
    assert chosen.silent == 2
    assert chosen.too_short == 1
    assert len(chosen.kept) == 1


def test_a_substantial_review_outranks_a_reaction_when_neither_is_on_topic(isolated_db):
    chosen = review_selection.select(
        [review("Volveria sin dudarlo la verdad."), review(PARKING)],
        terms=["alitas"],
        budget_chars=200,
        render=render,
    )

    assert chosen.kept[0]["review_text"] == PARKING


def test_standing_breaks_the_tie_between_two_on_topic_reviews(isolated_db):
    """One review from an account with four hundred behind it and one from an
    account with one are not the same witness, and nothing in the text says so."""
    quiet = review(WINGS, who="Quiet", count=1)
    known = review(WINGS, who="Known", count=380, level=8)

    chosen = review_selection.select(
        [quiet, known], terms=["alitas"], budget_chars=120, render=render
    )

    assert chosen.kept[0]["author_name"] == "Known"


def test_the_first_review_is_kept_however_long_it_is(isolated_db):
    """An empty page reads as a place nobody has reviewed, which would be a lie
    about the place."""
    chosen = review_selection.select(
        [review("alitas " + "x" * 50_000)],
        terms=["alitas"],
        budget_chars=100,
        render=render,
    )

    assert len(chosen.kept) == 1


def test_what_did_not_fit_is_counted_rather_than_forgotten(isolated_db):
    chosen = review_selection.select(
        [review(WINGS, who=f"R{n}") for n in range(10)],
        terms=["alitas"],
        budget_chars=200,
        render=render,
    )

    assert chosen.dropped_for_space == 10 - len(chosen.kept)
    assert chosen.bought == 10


def _store(run_id: str, sentences: list[str]) -> None:
    import json

    from app.core.database import transaction

    with transaction() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS listicle_search_results ("
            "run_id TEXT PRIMARY KEY, payload TEXT, created_at TEXT, updated_at TEXT)"
        )
        conn.execute(
            "INSERT INTO listicle_search_results (run_id, payload) VALUES (?, ?)",
            (run_id, json.dumps({"candidates": [{"evidence": s} for s in sentences]})),
        )


def test_a_month_is_never_the_subject_however_often_it_is_said(isolated_db):
    """Evidence is full of "abierto desde agosto" and "since 2019".

    On document frequency alone `agosto` can outrank a real subject word, and
    a term list containing it marks any review mentioning August as on-topic.
    Calendar words are excluded by name rather than by counting, because their
    frequency is not the thing that is wrong with them.
    """
    _store("run-months", [f"las alitas de este local, abierto desde agosto {n}"
                          for n in range(12)])

    terms = review_selection.subject_terms("run-months")

    assert "alitas" in terms
    assert "agosto" not in terms


def test_a_word_well_below_the_dominant_one_is_background_chatter(isolated_db):
    """`sede` is Spanish for "branch" -- about premises, not about wings.

    It appears under several candidates, so "seen under at least three" keeps
    it. What actually separates it from a subject word is the distance: on run
    `efd5a7cd` the counts run alitas 65 against sede 6. The floor is a share of
    the dominant term, so the same rule works on a run where the numbers are
    ten times larger or smaller.
    """
    _store(
        "run-floor",
        [f"sus alitas y sus salsas, numero {n}" for n in range(40)]
        + [f"la sede de {n}" for n in range(3)],
    )

    terms = review_selection.subject_terms("run-floor")

    assert "alitas" in terms and "salsas" in terms
    assert "sede" not in terms, "a word at a fifteenth of the top term is chatter"
