"""One place's blurb: a prompt built from its brief, and the text pasted back. No model calls."""

from app.features.listicle_pipeline import store
from tests.test_listicle_place_research import client, run  # noqa: F401
from tests.test_listicle_research_workspace import entry


def _fill(client, path, **slots):
    view = client.get(path).json()
    saved = client.patch(path, json={
        'version': view['version'], 'context_key': view['context_key'], 'slots': slots,
    })
    assert saved.status_code == 200, saved.text
    return saved.json()


def test_the_prompt_uses_the_working_title_and_only_the_filled_brief(client, run):
    path = entry(client, run)
    view = _fill(
        client, path,
        why_it_belongs='24 hour Red Ale marinade (f1, f2).',
        what_to_order_or_notice=['Eight wings with BBQ IPA sauce (f1)'],
        caveat='Do not state an exact dine-in price.',
    )
    prompt = view['blurb']['prompt']
    seed = store.load(run).seed
    assert view['title'] == seed
    assert f'titled "{seed}"' in prompt
    assert view['place_name'] and view['place_name'] in prompt
    assert '(f1' not in prompt
    # Review findings are stated as plain fact in the blurb, never attributed.
    assert 'never who said it or when' in prompt
    assert 'Eight wings with BBQ IPA sauce' in prompt
    assert 'What the visit feels like:' not in prompt  # empty optional slots are left out
    assert view['blurb']['text'] == '' and view['blurb']['version'] == 0


def test_a_pasted_blurb_is_saved_once_and_marked_when_the_brief_moves(client, run):
    path = entry(client, run)
    _fill(client, path, why_it_belongs='Named sauces.', what_to_order_or_notice=['BBQ IPA'])
    saved = client.put(path + '/blurb', json={'version': 0, 'text': '  Barbarian marinates its wings in Red Ale.  '})
    assert saved.status_code == 200, saved.text
    blurb = saved.json()['blurb']
    assert blurb['text'] == 'Barbarian marinates its wings in Red Ale.'
    assert blurb['version'] == 1 and blurb['stale'] is False

    # A tab that still thinks there is no blurb cannot overwrite it.
    assert client.put(path + '/blurb', json={'version': 0, 'text': 'Other.'}).status_code == 409

    after = _fill(client, path, useful_detail='Open until 3am on weekends.')
    assert after['blurb']['stale'] is True
    assert after['blurb']['text'] == 'Barbarian marinates its wings in Red Ale.'
