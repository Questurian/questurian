import pytest

from app.features.youtube2blog.youtube_source import parse_youtube_video_url


@pytest.mark.parametrize(
    "url",
    [
        "https://www.youtube.com/watch?v=abc123DEF45",
        "https://youtu.be/abc123DEF45",
        "https://www.youtube.com/shorts/abc123DEF45",
        "https://www.youtube.com/live/abc123DEF45?feature=share",
        "https://www.youtube.com/embed/abc123DEF45",
    ],
)
def test_parse_youtube_video_url_accepts_supported_formats(url: str):
    parsed = parse_youtube_video_url(url)
    assert parsed.video_id == "abc123DEF45"
    assert parsed.canonical_url == "https://www.youtube.com/watch?v=abc123DEF45"


@pytest.mark.parametrize(
    "url",
    [
        "https://www.youtube.com/channel/UC123",
        "https://www.youtube.com/@questurian",
        "https://www.youtube.com/c/questurian",
        "https://vimeo.com/123456",
        "not-a-url",
    ],
)
def test_parse_youtube_video_url_rejects_non_video_urls(url: str):
    with pytest.raises(ValueError):
        parse_youtube_video_url(url)
