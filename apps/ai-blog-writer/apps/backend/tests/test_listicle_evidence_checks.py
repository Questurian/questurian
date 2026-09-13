"""What the checks catch, each one written from a mistake that was really made.

Every case below is taken from the five preserved research attempts of run
`efd5a7cd` — the baseline this design is measured against. Those attempts
produced thirteen findings, all of them stored as evidence, none of them
checkable: every source was a `vertexaisearch.cloud.google.com` redirect that
names no publisher and expires.

These tests do not prove the new packets are true. They prove that the specific
ways the old ones were wrong now fail in a way somebody can see.

Nothing here reaches the web or a provider. The pages are strings.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from app.features.listicle_pipeline import evidence, research_brief
from app.features.listicle_pipeline.source_reader import PageRead


def brief(**overrides) -> research_brief.ResearchBrief:
    """BarBarian Bonilla 108, as the board actually holds it."""
    base = dict(
        name="BarBarian Bonilla 108",
        aliases=["Barbarian"],
        city="Lima Peru",
        district="Miraflores",
        address="C. Manuel Bonilla 108, Miraflores 15074, Peru",
        place_id="ChIJyQz17hnIBZERQqURcd_PGNg",
        article_title="Chicken Wings in Lima Peru",
        topic="chicken-wings",
        topic_label="chicken wings",
        standard="Wings named specifically by somebody other than the place.",
        exclusions="No delivery-only kitchens.",
        mode="initial",
        gap_text="",
        discovery_leads=[],
        held=[],
        operator_links=[],
    )
    base.update(overrides)
    return research_brief.build_brief(**base)


def page(text: str, *, url: str = "https://press.test/a", **overrides) -> PageRead:
    fields = dict(
        requested_url=url,
        final_url=url,
        state="ok",
        http_status=200,
        text=text,
        published_at="2025-04-02",
        retrieved_at=datetime(2026, 9, 12, tzinfo=timezone.utc),
    )
    fields.update(overrides)
    return PageRead(**fields)


def claim(**overrides) -> dict:
    body = {
        "text": "Something concrete about the wings here.",
        "kind": "other",
        "categories": ["signature_offering"],
        "about_subject": True,
        "scope": "unknown",
        "who_said_it": "unknown",
        "channel": "unknown",
        "temporal_type": "observation",
        "support": [],
    }
    body.update(overrides)
    return body


# --------------------------------------------------------------------------
# A passage that is not in the page it names
# --------------------------------------------------------------------------


def test_an_excerpt_that_is_not_in_its_page_is_not_evidence():
    """The check the old parser could not make.

    It validated that a citation pointed at an id the same reply had declared,
    so a reply that invented a source and then cited it passed. Here the page
    is real and held, and the quotation is simply not in it.
    """
    pages = [page("Las alitas se ahuman por cuatro horas y no son fritas.")]
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="The wings are smoked for four hours rather than fried.",
                    support=[
                        {"page_id": "p1", "excerpt": "se ahuman por cuatro horas"}
                    ],
                ),
                claim(
                    text="A critic called them the best in Lima.",
                    support=[
                        {"page_id": "p1", "excerpt": "las mejores alitas de Lima"}
                    ],
                ),
            ]
        },
        brief=brief(),
        pages=pages,
    )
    smoked, invented = packet.claims
    assert smoked.validation == "evidence_ready"
    assert invented.validation == "unsupported"
    assert any("is not in that page" in note for note in invented.notes)


def test_a_passage_matches_across_accents_and_whitespace():
    """A Spanish page and a transcription of it disagree about accents
    constantly, and a byte-equality check fails honest citations while a
    fabricated one copied verbatim would pass."""
    pages = [page("Las alitas anticucheras  se sirven\n con ají panca y rocoto.")]
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="The anticuchera wings come with ají panca and rocoto.",
                    support=[
                        {
                            "page_id": "p1",
                            "excerpt": "alitas anticucheras se sirven con aji panca y rocoto",
                        }
                    ],
                )
            ]
        },
        brief=brief(),
        pages=pages,
    )
    assert packet.claims[0].validation == "evidence_ready"


# --------------------------------------------------------------------------
# One branch's price is not the brand's
# --------------------------------------------------------------------------


def test_a_price_from_another_branch_does_not_become_this_branchs():
    """Verbatim from the baseline: "The BarBarian brand, including its Huancayo
    branch, offers chicken wings with specific prices" was stored as evidence on
    the Bonilla 108 profile."""
    huancayo = page(
        "BarBarian Huancayo, Jr. Puno 599. Alitas 8 piezas S/ 19.00.",
        url="https://aggregator.test/huancayo",
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="Eight wings cost S/ 19.00 at this bar.",
                    kind="price",
                    categories=["value_portions"],
                    scope="branch",
                    channel="dine_in",
                    support=[{"page_id": "p1", "excerpt": "Alitas 8 piezas S/ 19.00"}],
                )
            ]
        },
        brief=brief(),
        pages=[huancayo],
    )
    priced = packet.claims[0]
    assert priced.scope == "unknown"
    assert priced.validation == "review_needed"
    assert any("does not" in note or "no page" in note for note in priced.notes)
    # It is not deleted. The claim may well be true of that branch, and saying
    # so is more useful than losing it.
    assert priced.text.startswith("Eight wings")


def test_a_page_carrying_this_branchs_address_supports_a_branch_claim():
    here = page(
        "BarBarian, C. Manuel Bonilla 108, Miraflores. Alitas picantes S/ 28.00 "
        "en el local.",
        url="https://press.test/bonilla",
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="Spicy wings cost S/ 28.00 at the Bonilla 108 bar.",
                    kind="price",
                    categories=["value_portions"],
                    scope="branch",
                    channel="dine_in",
                    support=[
                        {"page_id": "p1", "excerpt": "Alitas picantes S/ 28.00 en el local"}
                    ],
                )
            ]
        },
        brief=brief(),
        pages=[here],
    )
    assert packet.claims[0].scope == "branch"
    assert packet.claims[0].validation == "evidence_ready"


def test_a_price_with_no_channel_is_flagged_rather_than_stored_as_the_price():
    """The baseline held S/ 25.00 from a menu and S/ 29.50 from Rappi for the
    same portion and could not say which was which."""
    listing = page(
        "C. Manuel Bonilla 108, Miraflores. Alitas 6 piezas S/ 29.50.",
        url="https://delivery.test/barbarian",
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="Six wings cost S/ 29.50.",
                    kind="price",
                    categories=["value_portions"],
                    scope="branch",
                    support=[{"page_id": "p1", "excerpt": "Alitas 6 piezas S/ 29.50"}],
                )
            ]
        },
        brief=brief(),
        pages=[listing],
    )
    assert packet.claims[0].validation == "review_needed"
    assert any("channel" in note for note in packet.claims[0].notes)


# --------------------------------------------------------------------------
# Keywords are not testimony
# --------------------------------------------------------------------------


def test_an_aggregators_keyword_blob_is_not_a_customer_review():
    """Verbatim from the baseline: "Customers have positively noted the 'ricas
    alitas'" — sourced to a Restaurant Guru keyword cloud."""
    guru = page(
        "C. Manuel Bonilla 108, Miraflores. ricas alitas · buena cerveza · "
        "ambiente agradable · buen servicio",
        url="https://guru.test/barbarian",
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="Customers have positively noted the ricas alitas.",
                    kind="review",
                    categories=["customer_observations"],
                    scope="branch",
                    who_said_it="aggregator",
                    support=[{"page_id": "p1", "excerpt": "ricas alitas"}],
                )
            ]
        },
        brief=brief(),
        pages=[guru],
    )
    assert packet.claims[0].validation == "review_needed"
    assert any("not testimony" in note for note in packet.claims[0].notes)


def test_a_named_reviewer_with_a_date_survives_the_same_check():
    review = page(
        "C. Manuel Bonilla 108, Miraflores. Carlos Ruiz, 12 de abril de 2025: "
        "las alitas picantes valen el viaje.",
        url="https://press.test/ruiz",
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="Carlos Ruiz wrote in April 2025 that the spicy wings "
                    "are worth the trip.",
                    kind="review",
                    categories=["customer_observations"],
                    scope="branch",
                    who_said_it="named_reviewer",
                    who_name="Carlos Ruiz",
                    event_date="2025-04-12",
                    support=[
                        {
                            "page_id": "p1",
                            "excerpt": "las alitas picantes valen el viaje",
                        }
                    ],
                )
            ]
        },
        brief=brief(),
        pages=[review],
    )
    assert packet.claims[0].validation == "evidence_ready"
    assert packet.claims[0].who_name == "Carlos Ruiz"


# --------------------------------------------------------------------------
# Dates, and what a date is allowed to establish
# --------------------------------------------------------------------------


def test_a_source_date_comes_off_the_page_and_never_off_the_claim():
    """McCarthy's baseline rested a current-menu claim partly on a 2020 opening
    article and a Paraguayan piece from the same year."""
    launch = page(
        "C. 2 de Mayo 220, Miraflores. McCarthy's abre en Miraflores.",
        url="https://peru-retail.test/mccarthys",
        published_at="2020-12-28",
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="The pub opened in Miraflores in 2020.",
                    kind="history",
                    categories=["history"],
                    scope="branch",
                    temporal_type="historical",
                    event_date="2026-01-01",
                    support=[
                        {"page_id": "p1", "excerpt": "abre en Miraflores"}
                    ],
                )
            ]
        },
        brief=brief(
            name="McCarthy's Irish Pub",
            aliases=[],
            address="C. 2 de Mayo 220, Miraflores 15074, Peru",
        ),
        pages=[launch],
    )
    # The page's own date, not anything the reply asserted about it.
    assert packet.claims[0].source_published_at == "2020-12-28"


def test_an_unsupported_claim_carries_no_date_at_all():
    """A date is the strongest currency signal a finding has, and one attached
    to a sentence nothing supports is exactly the shape of an unsupported
    claim about what is on the menu now."""
    menu = page("C. Manuel Bonilla 108, Miraflores. Carta 2026.")
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="The smoked wings are on the current menu.",
                    temporal_type="current_offering",
                    support=[
                        {"page_id": "p1", "excerpt": "alitas ahumadas en carta"}
                    ],
                )
            ]
        },
        brief=brief(),
        pages=[menu],
    )
    assert packet.claims[0].validation == "unsupported"
    assert packet.claims[0].source_published_at == ""


# --------------------------------------------------------------------------
# Identity is settled by the address, not by the title
# --------------------------------------------------------------------------


def test_a_page_whose_title_names_another_district_is_not_rejected_on_the_title():
    """McCarthy's Rappi listing is titled Surquillo and carries the Miraflores
    address. Rejecting it on the title would have lost the menu."""
    rappi = page(
        "McCarthy's Surquillo — Delivery. Dirección: C. 2 de Mayo 220, "
        "Miraflores. Alitas con 13 salsas.",
        url="https://rappi.test/mccarthys",
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="The pub offers wings with thirteen sauces.",
                    kind="signature",
                    categories=["signature_offering"],
                    scope="branch",
                    scope_basis="the page carries C. 2 de Mayo 220, Miraflores",
                    who_said_it="aggregator",
                    support=[
                        {"page_id": "p1", "excerpt": "Alitas con 13 salsas"}
                    ],
                )
            ]
        },
        brief=brief(
            name="McCarthy's Irish Pub",
            aliases=[],
            address="C. 2 de Mayo 220, Miraflores 15074, Peru",
        ),
        pages=[rappi],
    )
    assert packet.claims[0].scope == "branch"
    assert packet.claims[0].validation == "evidence_ready"


# --------------------------------------------------------------------------
# What counts as coverage of the subject
# --------------------------------------------------------------------------


def test_a_setting_fact_is_kept_and_does_not_count_as_subject_coverage():
    """Collecting the room is useful. Counting it as evidence about the wings
    is how a packet reports coverage it does not have — the baseline filed a
    "brewpub, gastropub and restaurant in the district" line under wings."""
    about = page(
        "C. Manuel Bonilla 108, Miraflores. Un brewpub de dos pisos con terraza."
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="It is a two-storey brewpub with a terrace.",
                    kind="setting",
                    categories=["setting"],
                    about_subject=False,
                    scope="branch",
                    who_said_it="business",
                    support=[
                        {"page_id": "p1", "excerpt": "brewpub de dos pisos con terraza"}
                    ],
                )
            ]
        },
        brief=brief(),
        pages=[about],
    )
    setting = packet.claims[0]
    assert setting.validation == "evidence_ready"
    summary = evidence.derived_coverage(packet, brief=brief(), pages=[about])
    # Kept, and worth nothing to the wings list's coverage.
    assert summary["evidence_ready_total"] == 1
    assert summary["subject_evidence_ready"] == 0


def test_coverage_separates_what_was_said_by_the_business_from_everybody_else():
    """The list's standard asks for somebody other than the place itself, so a
    packet that cannot count the difference cannot say whether it met it."""
    menu = page(
        "C. Manuel Bonilla 108, Miraflores. Nuestras alitas picantes, seis "
        "piezas. Carlos Ruiz: valen el viaje.",
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="Spicy wings are a regular six-piece menu item.",
                    who_said_it="business",
                    scope="branch",
                    support=[
                        {"page_id": "p1", "excerpt": "alitas picantes, seis piezas"}
                    ],
                ),
                claim(
                    text="Carlos Ruiz wrote that they are worth the trip.",
                    who_said_it="named_reviewer",
                    who_name="Carlos Ruiz",
                    scope="branch",
                    categories=["customer_observations"],
                    support=[{"page_id": "p1", "excerpt": "valen el viaje"}],
                ),
            ]
        },
        brief=brief(),
        pages=[menu],
    )
    summary = evidence.derived_coverage(packet, brief=brief(), pages=[menu])
    assert summary["subject_evidence_ready"] == 2
    assert summary["attributable_opinion"] == 1
    assert summary["business_only"] == 1


def test_a_page_that_could_not_be_read_is_counted_as_a_gap_not_an_absence():
    readable = page("C. Manuel Bonilla 108, Miraflores. Alitas picantes.")
    blocked = PageRead(
        requested_url="https://paywalled.test/summum",
        final_url="https://paywalled.test/summum",
        state="blocked",
        http_status=403,
        note="The page answered 403.",
    )
    packet = evidence.check(
        {
            "claims": [
                claim(
                    text="Spicy wings are on the menu here.",
                    scope="branch",
                    support=[{"page_id": "p1", "excerpt": "Alitas picantes"}],
                )
            ]
        },
        brief=brief(),
        pages=[readable, blocked],
    )
    summary = evidence.derived_coverage(
        packet, brief=brief(), pages=[readable, blocked]
    )
    assert summary["pages_read"] == 1
    assert summary["pages_attempted"] == 2
    assert summary["pages_unreachable"] == [
        {"url": "https://paywalled.test/summum", "state": "blocked"}
    ]


# --------------------------------------------------------------------------
# Failures that are the extraction's own
# --------------------------------------------------------------------------


def test_a_reply_that_is_not_the_object_asked_for_is_its_own_failure():
    with pytest.raises(evidence.ExtractionInvalid) as raised:
        evidence.check("The", brief=brief(), pages=[page("anything")])
    assert "stopped after 3 characters" in str(raised.value)


def test_a_truncated_extraction_says_where_the_json_stops():
    cut = '```json\n{"claims": [{"text": "La Casa de las Alitas sirve once'
    with pytest.raises(evidence.ExtractionInvalid) as raised:
        evidence.check(cut, brief=brief(), pages=[page("anything")])
    assert "not JSON" in str(raised.value)
    assert "column 1" not in str(raised.value)


# --------------------------------------------------------------------------
# A newline inside a quoted passage
# --------------------------------------------------------------------------


def test_a_passage_containing_a_line_break_does_not_lose_the_whole_reply():
    """Seen in the field: "Invalid control character at: line 26 column 5520".

    Gemini quotes a passage the way it was laid out on the page, and a menu row
    or an address block carries a line break. Strict JSON refuses the entire
    envelope over it -- six thousand characters of readable pages thrown away
    because one quoted sentence kept the newline it had in the source.
    """
    pages = [page("Alitas 6 piezas\nS/ 25.00 en el local, C. Manuel Bonilla 108.")]
    raw = (
        '{"claims": [{"text": "Six wings cost S/ 25.00 at the table.",'
        ' "kind": "price", "scope": "branch", "channel": "dine_in",'
        ' "support": [{"page_id": "p1", "excerpt": "Alitas 6 piezas\n'
        'S/ 25.00 en el local"}]}]}'
    )
    packet = evidence.check(raw, brief=brief(), pages=pages)
    assert len(packet.claims) == 1
    # And the passage still has to be in the page. Loosening the parser did not
    # loosen the check.
    assert packet.claims[0].validation == "evidence_ready"


def test_a_line_break_in_a_discovery_passage_survives_too():
    from app.features.listicle_pipeline import profile_research

    raw = (
        '{"pages": [{"url": "https://press.test/a", "publisher": "El Comercio",'
        ' "passage": "Alitas ahumadas\npor cuatro horas"}]}'
    )
    parsed = profile_research.parse_discovery(raw)
    assert parsed.pages[0].passage == "Alitas ahumadas\npor cuatro horas"


def test_a_reply_that_is_genuinely_not_json_still_fails():
    """The loosened parser must not start accepting prose."""
    with pytest.raises(evidence.ExtractionInvalid) as raised:
        evidence.check(
            "Here is what I found about the wings at this bar, in summary form.",
            brief=brief(),
            pages=[page("anything")],
        )
    assert "not JSON" in str(raised.value)


# --------------------------------------------------------------------------
# A provider that stops saying anything
# --------------------------------------------------------------------------


def test_a_model_that_loops_on_one_character_is_named_as_that():
    """Seen for real on BarBarian: gemini-2.5-flash wrote 2,623 characters of
    pages and 10,932 characters of the digit zero, in two runs, having started
    the whole answer over in between. 11,778 output tokens were charged.

    "The reply was not JSON" sends whoever reads it looking for a formatting
    problem. The problem is that the provider stopped writing an answer.
    """
    from app.features.listicle_pipeline import profile_research

    reply = (
        '{"pages": [{"url": "https://press.test/a", "publisher": "El Comercio",'
        ' "passage": "alitas ahumadas"}, {"url": "https://press.test/b",'
        ' "publisher": "Publimetro"' + "0" * 5000
    )
    parsed = profile_research.parse_discovery(reply)
    assert parsed.salvaged is True
    assert any("repeated one character" in issue for issue in parsed.issues)
    assert any("x 5,000" in issue for issue in parsed.issues)
    # The one entry it finished writing is kept. The half-written one is not
    # guessed at.
    assert [page.url for page in parsed.pages] == ["https://press.test/a"]


def test_salvage_never_invents_the_half_written_entry():
    from app.features.listicle_pipeline import profile_research

    reply = '{"pages": [{"url": "https://press.test/a", "publisher": "El Com'
    with pytest.raises(profile_research.ResponseInvalid):
        profile_research.parse_discovery(reply)


def test_a_restarted_answer_does_not_count_its_pages_twice():
    """A model that loses the thread often starts over. Both copies are
    complete and they are one page."""
    from app.features.listicle_pipeline import profile_research

    entry = '{"url": "https://press.test/a", "publisher": "El Comercio"}'
    reply = (
        '{"pages": [' + entry + "," + "0" * 200 + '\n{"pages": [' + entry + ","
    )
    parsed = profile_research.parse_discovery(reply)
    assert len(parsed.pages) == 1
    assert any("same page written twice" in issue for issue in parsed.issues)


# --------------------------------------------------------------------------
# Addresses come from the search, never from the answer
# --------------------------------------------------------------------------

_REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/"


def _discovered(*entries: dict):
    from app.features.listicle_pipeline import profile_research

    return profile_research.parse_discovery(json.dumps({"pages": list(entries)}))


def test_a_typed_address_is_replaced_by_the_search_result_for_that_site():
    """BarBarian, twice: the model died typing
    `rappi.com.pe/restaurantes/1000000...`, an id it had never seen. The page
    it meant was in the result list the whole time."""
    from app.features.listicle_pipeline import profile_research

    anchored = profile_research.anchor_to_search(
        _discovered(
            {
                "site": "www.rappi.com.pe",
                "url": "https://www.rappi.com.pe/restaurantes/1000000000",
                "passage": "alitas bbq",
            }
        ),
        [{"uri": _REDIRECT + "rappi", "title": "rappi.com.pe"}],
        [],
    )
    assert [(p.url, p.address_from) for p in anchored.pages] == [
        (_REDIRECT + "rappi", "search")
    ]


def _answer(*entries: dict) -> str:
    """An answer laid out the way Gemini lays it out, so supports can be found."""
    return "```json\n" + json.dumps({"pages": list(entries)}, indent=2, ensure_ascii=False) + "\n```"


def test_the_providers_attribution_is_found_by_where_it_sits_in_the_answer():
    """The shape of the first real run (002330f8b00c): supports are short
    stretches -- "Alitas.", a price repeated in three entries -- and a stretch
    running from the end of one entry into the next is credited to the next."""
    from app.features.listicle_pipeline import profile_research

    text = _answer(
        {"site": "Rappi", "title": "Barbarian - Miraflores", "passage": "Especialidad. Alitas.", "why": "wings on the menu", "scope": "branch"},
        {"site": "Somewhere", "title": "BarBarian Miraflores - Carta", "passage": "Alas De Pollo", "scope": "branch"},
        {"site": "Rappi", "title": "Barbarian - Cercado", "passage": "Alitas S/ 37.80.", "scope": "brand"},
        {"site": "Rappi", "title": "Barbarian - Los Ficus", "passage": "Alitas S/ 37.80.", "scope": "brand"},
    )
    parsed = profile_research.parse_discovery(text)
    tail_of_first = text[text.index('wings on the menu'):text.index('BarBarian Miraflores - Carta') - 30]
    chunks = [
        {"uri": _REDIRECT + "rappi-miraflores", "title": "rappi.com.pe"},
        {"uri": _REDIRECT + "carta", "title": "carta.menu"},
        {"uri": _REDIRECT + "rappi-los-ficus", "title": "rappi.com.pe"},
        {"uri": _REDIRECT + "rappi-cercado", "title": "rappi.com.pe"},
    ]
    supports = [
        {"text": "Alitas.", "chunks": [0]},
        {"text": tail_of_first.strip(), "chunks": [1]},
        {"text": "S/ 37.80.", "chunks": [3]},
        {"text": "S/ 37.80.", "chunks": [2]},
    ]
    anchored = profile_research.anchor_to_search(parsed, chunks, supports, text=text)
    by_title = {page.title: page.url for page in anchored.pages}
    assert by_title["Barbarian - Miraflores"] == _REDIRECT + "rappi-miraflores"
    # A site the answer named wrongly still gets its page, through attribution.
    assert by_title["BarBarian Miraflores - Carta"] == _REDIRECT + "carta"
    # The same price in two entries lands in each entry, in order.
    assert by_title["Barbarian - Cercado"] == _REDIRECT + "rappi-cercado"
    assert by_title["Barbarian - Los Ficus"] == _REDIRECT + "rappi-los-ficus"


def test_a_site_named_in_words_matches_its_result():
    from app.features.listicle_pipeline import profile_research

    anchored = profile_research.anchor_to_search(
        _discovered(
            {"site": "The City Lane", "title": "BarBarian, Miraflores"},
            {"site": "Rappi", "title": "Barbarian - Miraflores"},
        ),
        [
            {"uri": _REDIRECT + "rappi", "title": "rappi.com.pe"},
            {"uri": _REDIRECT + "citylane", "title": "thecitylane.com"},
        ],
        [],
    )
    assert [(p.title, p.url) for p in anchored.pages] == [
        ("BarBarian, Miraflores", _REDIRECT + "citylane"),
        ("Barbarian - Miraflores", _REDIRECT + "rappi"),
    ]


def test_pages_about_this_branch_are_read_before_brand_wide_ones():
    """The first real run read four Rappi listings for other branches because
    they came first. Order only: a brand page is still read when there is room."""
    from app.features.listicle_pipeline import profile_research

    anchored = profile_research.anchor_to_search(
        _discovered(
            {"site": "rappi.com.pe", "title": "Barbarian - Cercado", "scope": "brand"},
            {"site": "elcomercio.pe", "title": "Las alitas de Miraflores", "scope": "branch"},
        ),
        [
            {"uri": _REDIRECT + "rappi", "title": "rappi.com.pe"},
            {"uri": _REDIRECT + "comercio", "title": "elcomercio.pe"},
            {"uri": _REDIRECT + "nobody", "title": "somewhere.pe"},
        ],
        [],
    )
    assert [p.url for p in anchored.pages] == [
        _REDIRECT + "comercio",
        _REDIRECT + "rappi",
        _REDIRECT + "nobody",
    ]


def test_a_page_no_result_matches_is_kept_and_never_opened():
    """An invented host -- `mccarthysirishpub.com.mx` was one -- has nothing in
    the result list to match, so it has no address to open."""
    from app.features.listicle_pipeline import profile_research

    anchored = profile_research.anchor_to_search(
        _discovered(
            {
                "site": "mccarthysirishpub.com.mx",
                "url": "https://mccarthysirishpub.com.mx/menu/",
                "passage": "chicken wings",
            }
        ),
        [{"uri": _REDIRECT + "x", "title": "elcomercio.pe"}],
        [],
    )
    extra, described = anchored.pages
    assert (described.url, described.address_from) == ("", "none")
    assert described.passage == "chicken wings"
    assert extra.address_from == "search_only"
    assert any("matched no search result" in issue for issue in anchored.issues)


def test_with_no_results_nothing_the_answer_typed_is_opened():
    from app.features.listicle_pipeline import profile_research

    anchored = profile_research.anchor_to_search(
        _discovered({"url": "https://press.test/a", "site": "press.test"}), [], []
    )
    assert [page.url for page in anchored.pages] == [""]
    assert any("no results" in issue for issue in anchored.issues)


def test_searches_with_no_result_list_are_said_to_be_a_gap_in_the_reply():
    """McCarthy's: eight searches reported and no result list; the same request
    an hour later returned six results."""
    from app.features.listicle_pipeline import profile_research

    anchored = profile_research.anchor_to_search(
        _discovered({"site": "rappi.com.pe", "title": "McCarthy's"}), [], [], searched=8
    )
    assert anchored.pages[0].url == ""
    assert any("reported 8 search(es) but sent back no result list" in i for i in anchored.issues)


_BLOCKS = """PAGE
Site: Restaurant Guru
Title: McCarthy's Irish Pub, Miraflores - Menú
Published: August 29 2026
Answers: 1, 3
Scope: branch
Passage: Opiniones de los clientes. ricas alitas.
José Gabriel Neyra hace 6 días en Google.
Why: a recent review naming the wings

PAGE
Site: Rappi
Title: McCarthy's - Surquillo Precios y Menú
Published: unknown
Answers: 1, 2, 4
Scope: brand
Passage: Alitas 8 Piezas. S/ 23.90.
Why: the delivery menu

NOT FOUND: 3. Nothing published names a local food writer on the wings.
NOTE: The Rappi title says Surquillo but the address is Miraflores.
"""


def test_a_plain_text_reply_reads_into_pages_dates_and_notes():
    """place-research/6. Gemini leaves the result list out of a reply that is
    only a code block; the same request in plain blocks kept it 6 times in 7."""
    from app.features.listicle_pipeline import profile_research

    parsed = profile_research.parse_discovery(_BLOCKS)
    guru, rappi = parsed.pages
    assert (guru.site, guru.published_at, guru.answers, guru.scope) == (
        "Restaurant Guru", "2026-08-29", [1, 3], "branch"
    )
    # A passage keeps a line the page broke it over.
    assert guru.passage.endswith("José Gabriel Neyra hace 6 días en Google.")
    assert rappi.published_at == "" and rappi.entry == 1
    assert parsed.not_found == ["3. Nothing published names a local food writer on the wings."]
    assert parsed.notes == ["The Rappi title says Surquillo but the address is Miraflores."]
    assert parsed.issues == []


def test_attribution_inside_plain_blocks_ties_each_result_to_its_block():
    from app.features.listicle_pipeline import profile_research

    parsed = profile_research.parse_discovery(_BLOCKS)
    anchored = profile_research.anchor_to_search(
        parsed,
        [
            {"uri": _REDIRECT + "guru", "title": "restaurantguru.com"},
            {"uri": _REDIRECT + "rappi-a", "title": "rappi.com.pe"},
            {"uri": _REDIRECT + "rappi-b", "title": "rappi.com.pe"},
        ],
        [
            {"text": "PAGE\nSite: Restaurant Guru", "chunks": [0]},
            {"text": "S/ 23.90.", "chunks": [2]},
        ],
        text=_BLOCKS,
    )
    by_title = {page.title: page.url for page in anchored.pages}
    assert by_title["McCarthy's Irish Pub, Miraflores - Menú"] == _REDIRECT + "guru"
    # Attribution, not the first rappi result, decides.
    assert by_title["McCarthy's - Surquillo Precios y Menú"] == _REDIRECT + "rappi-b"


def test_block_dates_are_read_in_the_forms_the_model_writes():
    from app.features.listicle_pipeline.profile_research import _block_date

    assert _block_date("2025-10-28") == "2025-10-28"
    assert _block_date("October 28 2025") == "2025-10-28"
    assert _block_date("28 de octubre de 2025") == "2025-10-28"
    assert _block_date("2026 (based on copyright on related pages)") == "2026"
    assert _block_date("unknown") == ""


def test_one_result_is_never_given_to_two_entries():
    from app.features.listicle_pipeline import profile_research

    anchored = profile_research.anchor_to_search(
        _discovered(
            {"site": "elcomercio.pe", "title": "Las mejores alitas"},
            {"site": "elcomercio.pe", "title": "Otra nota"},
        ),
        [{"uri": _REDIRECT + "one", "title": "elcomercio.pe"}],
        [],
    )
    assert [p.url for p in anchored.pages] == [_REDIRECT + "one", ""]


def test_a_reply_that_finishes_cleanly_is_not_marked_salvaged():
    from app.features.listicle_pipeline import profile_research

    parsed = profile_research.parse_discovery(
        '{"pages": [{"url": "https://press.test/a", "publisher": "El Comercio"}],'
        ' "searched": ["alitas"], "not_found": [], "notes": []}'
    )
    assert parsed.salvaged is False
    assert parsed.issues == []
