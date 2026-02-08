from contextlib import contextmanager
import sqlite3
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

import app.core.article_types as article_types_store
from app.main import app


@pytest.fixture
def client_with_temp_article_types_db(tmp_path, monkeypatch):
    db_path = tmp_path / 'pipeline.db'

    @contextmanager
    def get_test_db_connection():
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    monkeypatch.setattr(
        article_types_store,
        'get_db_connection',
        get_test_db_connection,
    )
    article_types_store.ensure_article_types_table()

    return TestClient(app)


def test_article_types_routes_are_canonical_only(
    client_with_temp_article_types_db,
):
    client = client_with_temp_article_types_db

    create_response = client.post(
        '/article-types',
        json={'name': 'How-to', 'definition': 'Step-by-step instructional article'},
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created['name'] == 'How-to'

    canonical_response = client.get('/article-types')
    assert canonical_response.status_code == 200
    assert canonical_response.json() == [created]

    name_definitions_response = client.get('/article-types/name-definitions')
    assert name_definitions_response.status_code == 200
    assert name_definitions_response.json() == [
        {
            'name': 'How-to',
            'definition': 'Step-by-step instructional article',
        }
    ]
    assert set(name_definitions_response.json()[0].keys()) == {'name', 'definition'}

    legacy_response = client.get('/youtube2blog/article-types')
    assert legacy_response.status_code == 404


def test_update_article_type_uses_id_and_returns_conflict_for_duplicate_name(
    client_with_temp_article_types_db,
):
    client = client_with_temp_article_types_db

    first = client.post(
        '/article-types',
        json={'name': 'Travel Guide', 'definition': 'Long-form destination guide'},
    ).json()
    second = client.post(
        '/article-types',
        json={'name': 'Product Review', 'definition': 'Pros, cons, and verdict'},
    ).json()

    update_response = client.put(
        f"/article-types/{first['id']}",
        json={
            'name': 'Updated Travel Guide',
            'definition': 'Updated destination guide definition',
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated['id'] == first['id']
    assert updated['name'] == 'Updated Travel Guide'

    all_rows = client.get('/article-types').json()
    names = [row['name'] for row in all_rows]
    assert 'Updated Travel Guide' in names
    assert 'Travel Guide' not in names
    assert 'Product Review' in names

    duplicate_name_response = client.put(
        f"/article-types/{first['id']}",
        json={
            'name': second['name'],
            'definition': 'Trying to reuse an existing name',
        },
    )
    assert duplicate_name_response.status_code == 409

    missing_id_response = client.put(
        '/article-types/9999',
        json={
            'name': 'Missing',
            'definition': 'Should not exist',
        },
    )
    assert missing_id_response.status_code == 404


def test_get_article_type_guidelines_by_id_and_name(
    client_with_temp_article_types_db,
):
    client = client_with_temp_article_types_db

    created = client.post(
        '/article-types',
        json={
            'name': 'Adventure Guide',
            'definition': (
                'Focuses on activities like hiking, diving, trekking, '
                'or other adventures.'
            ),
        },
    ).json()

    article_types_store.write_article_type(
        name='Adventure Guide',
        definition=created['definition'],
        guideline='Cover gear, route difficulty, and safety considerations.',
        title_guideline='Use action verbs and mention activity type.',
    )

    by_id_response = client.get(f"/article-types/{created['id']}/guidelines")
    assert by_id_response.status_code == 200
    assert by_id_response.json() == {
        'id': created['id'],
        'name': 'Adventure Guide',
        'guideline': 'Cover gear, route difficulty, and safety considerations.',
        'title_guideline': 'Use action verbs and mention activity type.',
    }

    encoded_name = quote('Adventure Guide', safe='')
    by_name_response = client.get(f'/article-types/by-name/{encoded_name}/guidelines')
    assert by_name_response.status_code == 200
    assert by_name_response.json() == by_id_response.json()

    missing_id_response = client.get('/article-types/9999/guidelines')
    assert missing_id_response.status_code == 404

    missing_name_response = client.get('/article-types/by-name/does-not-exist/guidelines')
    assert missing_name_response.status_code == 404
