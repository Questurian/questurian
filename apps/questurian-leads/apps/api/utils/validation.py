import re
from urllib.parse import urlparse


class InvalidUrlError(ValueError):
    pass


class InvalidSubredditError(ValueError):
    pass


def _extract_subreddit_from_path(path: str) -> str | None:
    parts = [part for part in path.split("/") if part]
    if not parts:
        return None
    if parts[0].lower() == "r":
        return parts[1] if len(parts) > 1 else None
    return parts[0]


def validate_feed_url(url: str) -> str:
    if not isinstance(url, str):
        raise InvalidUrlError("URL must be a string.")

    cleaned = url.strip()
    if not cleaned:
        raise InvalidUrlError("URL is required.")

    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https"):
        raise InvalidUrlError("URL must start with http or https.")
    if not parsed.netloc:
        raise InvalidUrlError("URL must include a hostname.")

    return cleaned


def validate_subreddit(value: str) -> str:
    if not isinstance(value, str):
        raise InvalidSubredditError("Subreddit must be a string.")

    cleaned = value.strip()
    if not cleaned:
        raise InvalidSubredditError("Subreddit is required.")

    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        parsed = urlparse(cleaned)
        extracted = _extract_subreddit_from_path(parsed.path)
        if not extracted:
            raise InvalidSubredditError("Subreddit URL must include /r/{name}.")
        cleaned = extracted

    cleaned = cleaned.strip().lstrip("/")
    if cleaned.lower().startswith("r/"):
        cleaned = cleaned.split("/", 1)[1]

    cleaned = cleaned.strip().strip("/").lower()
    if not cleaned:
        raise InvalidSubredditError("Subreddit is required.")

    if not re.match(r"^[a-z0-9][a-z0-9_]{0,49}$", cleaned):
        raise InvalidSubredditError(
            "Subreddit must be alphanumeric and may include underscores."
        )

    return cleaned
