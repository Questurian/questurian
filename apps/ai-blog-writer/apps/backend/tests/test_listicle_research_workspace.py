"""Manual research through the entry workspace API. No provider calls."""

import json

from tests.test_listicle_place_research import client, run, _cards, _prepare, BASE


def packet():
    return {
        "identity_match": {"status": "matched", "note": "Address matches."},
        "fit": {"status": "usable", "why": "Named wings", "source_urls": []},
        "facts": [
            {
                "id": "f1",
                "category": "signature",
                "text": "Wings come with ají amarillo sauce.",
                "why_useful": "A specific sauce",
                "scope": "branch",
                "temporal_type": "current",
                "observed_or_published_at": "2026-09-01",
                "source": {
                    "url": "https://menu.example/wings",
                    "publisher": "Menu",
                    "title": "Wings",
                },
            }
        ],
        "editorial_take": {
            "why_it_belongs": "Ají amarillo wings give this entry a specific reason.",
            "what_to_order_or_notice": ["Ají amarillo wings"],
        },
        "stale_or_rejected_claims": [],
        "open_questions": [],
    }


def entry(client, run):
    card = next(iter(_cards(client, run).values()))
    _prepare(client, run, card["candidate_id"])
    path = f'{BASE}/board/{run}/candidates/{card["candidate_id"]}/workspace'
    opened = client.post(path + '/open')
    assert opened.status_code == 200, opened.text
    return path


def test_prompt_and_preview_do_not_change_saved_material(client, run):
    path = entry(client, run)
    before = client.get(path)
    assert before.status_code == 200, before.text
    view = before.json()
    assert "LEADS, NOT EVIDENCE" in view["prompt"]
    assert "Ají amarillo" not in view["prompt"]
    preview = client.post(path + '/preview', json={"raw_json": json.dumps(packet())})
    assert preview.status_code == 200, preview.text
    assert preview.json()["changes"][0]["field"] == "why_it_belongs"
    assert client.get(path).json() == view
    invalid = client.post(path + '/preview', json={"raw_json": "not json"})
    assert invalid.status_code == 422


def test_selected_import_persists_once_and_stale_edits_are_refused(client, run):
    path = entry(client, run)
    preview = client.post(
        path + '/preview', json={"raw_json": json.dumps(packet())}
    ).json()
    body = {
        "raw_json": json.dumps(packet()),
        "version": preview["version"],
        "context_key": preview["context_key"],
        "import_key": "import-one",
        "fields": ["why_it_belongs", "what_to_order_or_notice"],
        "fact_ids": ["f1"],
    }
    saved = client.post(path + '/apply', json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["ready"] is True
    assert saved.json()["slots"]["story_depth"] is None
    assert client.post(path + '/apply', json=body).status_code == 200
    profile = client.get(
        f'{BASE}/profiles/{saved.json()["profile_id"]}/research'
    ).json()
    assert len(profile["findings"]) == 1
    assert profile["findings"][0]["origin"] == "external_import"
    assert profile["findings"][0]["validation"] == "not_checked"
    edited = client.patch(
        path,
        json={
            "version": saved.json()["version"],
            "context_key": preview["context_key"],
            "slots": {"why_it_belongs": "Operator chooses the sauce contrast."},
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["slots"]["what_to_order_or_notice"] == ["Ají amarillo wings"]
    assert (
        client.patch(
            path,
            json={
                "version": saved.json()["version"],
                "context_key": preview["context_key"],
                "slots": {"why_it_belongs": "Stale tab."},
            },
        ).status_code
        == 409
    )
    assert (
        client.get(path).json()["slots"]["why_it_belongs"]
        == "Operator chooses the sauce contrast."
    )


def test_wrong_branch_and_unknown_fact_ids_cannot_be_applied(client, run):
    path = entry(client, run)
    original = client.get(path).json()
    data = packet()
    data['identity_match']['status'] = 'wrong_branch'
    preview = client.post(path + '/preview', json={'raw_json': json.dumps(data)}).json()
    assert preview['can_apply'] is False
    body = {
        'raw_json': json.dumps(data),
        'version': original['version'],
        'context_key': original['context_key'],
        'import_key': 'wrong',
        'fields': [],
        'fact_ids': ['f1'],
    }
    assert client.post(path + '/apply', json=body).status_code == 422
    data['identity_match']['status'] = 'matched'
    body.update(raw_json=json.dumps(data), fact_ids=['missing'])
    assert client.post(path + '/apply', json=body).status_code == 422
    assert client.get(path).json() == original


def test_failed_import_rolls_back_sources_findings_and_brief(client, run, monkeypatch):
    from app.features.listicle_pipeline import profile_store

    path = entry(client, run)
    original = client.get(path).json()
    data = packet()
    data['facts'].append(
        {
            **data['facts'][0],
            'id': 'f2',
            'text': 'Wings also come with lemon pepper sauce.',
        }
    )
    save = profile_store.save_finding

    def fail_second(finding, **kwargs):
        if 'lemon pepper' in finding.text:
            raise ValueError('Simulated second finding failure')
        return save(finding, **kwargs)

    monkeypatch.setattr(profile_store, 'save_finding', fail_second)
    response = client.post(
        path + '/apply',
        json={
            'raw_json': json.dumps(data),
            'version': 0,
            'context_key': original['context_key'],
            'import_key': 'rollback',
            'fields': ['why_it_belongs'],
            'fact_ids': ['f1', 'f2'],
        },
    )
    assert response.status_code == 422
    assert client.get(path).json() == original
    assert profile_store.findings(original['profile_id']) == []
    assert profile_store.sources(original['profile_id']) == []


def test_changed_branch_refuses_old_preview(client, run):
    from app.features.listicle_pipeline import store

    path = entry(client, run)
    original = client.get(path).json()
    candidate_id = path.split('/')[-2]
    checks = store.load_google_checks(run)
    checks[candidate_id]['place_id'] = 'different-building'
    store.save_google_check(run, candidate_id, checks[candidate_id])
    response = client.post(
        path + '/apply',
        json={
            'raw_json': json.dumps(packet()),
            'version': 0,
            'context_key': original['context_key'],
            'import_key': 'old-branch',
            'fields': ['why_it_belongs'],
            'fact_ids': ['f1'],
        },
    )
    assert response.status_code in {409, 422}


def test_new_import_key_deduplicates_facts_and_reused_key_cannot_change_payload(
    client, run
):
    path = entry(client, run)
    current = client.get(path).json()
    body = {
        'raw_json': json.dumps(packet()),
        'version': current['version'],
        'context_key': current['context_key'],
        'import_key': 'first',
        'fields': ['what_to_order_or_notice'],
        'fact_ids': ['f1'],
    }
    first = client.post(path + '/apply', json=body).json()
    body.update(import_key='second', version=first['version'])
    second = client.post(path + '/apply', json=body)
    assert second.status_code == 200
    profile = client.get(f'{BASE}/profiles/{current["profile_id"]}/research').json()
    assert len(profile['findings']) == len(profile['sources']) == 1
    assert second.json()['slots']['why_it_belongs'] is None
    assert second.json()['ready'] is False
    body['fields'] = ['why_it_belongs']
    assert client.post(path + '/apply', json=body).status_code == 409


def test_manual_minimal_brief_can_be_saved_without_any_import(client, run):
    path = entry(client, run)
    current = client.get(path).json()
    saved = client.patch(
        path,
        json={
            'version': 0,
            'context_key': current['context_key'],
            'slots': {
                'why_it_belongs': 'A focused wings menu.',
                'what_to_order_or_notice': ['Lemon pepper wings'],
            },
        },
    )
    assert saved.status_code == 200
    assert saved.json()['ready'] is True
    assert saved.json()['supporting_findings']['why_it_belongs'] == []
    assert client.get(path).json()['slots']['useful_detail'] is None


def test_invalid_fact_source_or_duplicate_fact_id_is_rejected(client, run):
    path = entry(client, run)
    data = packet()
    data['facts'][0]['source']['url'] = 'javascript:alert(1)'
    assert (
        client.post(path + '/preview', json={'raw_json': json.dumps(data)}).status_code
        == 422
    )
    data = packet()
    data['facts'].append(data['facts'][0])
    assert (
        client.post(path + '/preview', json={'raw_json': json.dumps(data)}).status_code
        == 422
    )


def _linkified(raw, start, end):
    """What copying a chat answer does: the span becomes [text](encoded text)."""
    from urllib.parse import quote

    span = raw[start:end]
    return raw[:start] + f'[{span}]({quote(span, safe=":/[]{},")})' + raw[end:]


def test_json_copied_from_a_chat_with_linked_urls_is_restored():
    from app.features.listicle_pipeline import research_workspace

    data = packet()
    data['fit']['source_urls'] = ['https://menu.example/wings', 'https://b.example/x']
    raw = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
    # One link swallows JSON structure between two URLs, one sits inside a source.
    first = raw.index('https://menu.example/wings')
    raw = _linkified(raw, first, raw.index('"text"', first) + len('"text":"Wings'))
    url = raw.index('https://menu.example/wings', raw.index('"source"'))
    raw = _linkified(raw, url, raw.index('"title":"Wings', url) + len('"title":"Wings'))
    fenced = f'```json\n{raw}\n```'
    parsed = research_workspace.parse(fenced)
    assert parsed.model_dump() == research_workspace.ExternalPacket.model_validate(data).model_dump()


def test_a_real_markdown_link_inside_a_value_is_left_alone():
    from app.features.listicle_pipeline import research_workspace

    data = packet()
    data['facts'][0]['text'] = 'See [the menu](https://menu.example/wings) for sauces.'
    parsed = research_workspace.parse(json.dumps(data))
    assert parsed.facts[0].text == data['facts'][0]['text']
