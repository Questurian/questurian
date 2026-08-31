"""Prompt2Blog saved-article listing and Payload sync route contracts."""


from tests.prompt2blog_test_support import response_payload

import app.features.prompt2blog.routes as prompt2blog_routes

pytest_plugins = ["tests.prompt2blog_test_fixtures"]


def test_completed_article_is_listed_with_editorial_metadata(
    completed_prompt2blog_run,
):
    articles_payload = response_payload(prompt2blog_routes.get_articles())
    matching = [
        item for item in articles_payload if item["run_id"] == completed_prompt2blog_run
    ]

    assert matching
    assert matching[0]["title"] == "Persisted Prompt2Blog Title"
    assert matching[0]["article_type"] == "Explainer"


def test_completed_article_sync_status_can_be_marked(
    completed_prompt2blog_run,
):
    sync_before = response_payload(
        prompt2blog_routes.get_sync_status(completed_prompt2blog_run)
    )
    assert sync_before["synced_to_payload"] is False

    sync_mark = response_payload(
        prompt2blog_routes.mark_article_as_synced( completed_prompt2blog_run, {"payload_article_id": 8883}, )
    )
    assert sync_mark["payload_article_id"] == 8883

    sync_after = response_payload(
        prompt2blog_routes.get_sync_status(completed_prompt2blog_run)
    )
    assert sync_after["synced_to_payload"] is True
    assert sync_after["payload_article_id"] == 8883
