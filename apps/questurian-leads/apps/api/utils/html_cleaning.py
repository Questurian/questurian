"""HTML cleaning utilities for content processing."""

import re
from html.parser import HTMLParser
from typing import Optional


class HTMLStripper(HTMLParser):
    """Custom HTML parser that strips all tags and preserves text content."""

    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs = True
        self.text = []

    def handle_data(self, data):
        self.text.append(data)

    def get_text(self):
        return ''.join(self.text)


class HTMLImageExtractor(HTMLParser):
    """Extract the first image URL from an HTML string."""

    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs = True
        self.image_url = None

    def handle_starttag(self, tag, attrs):
        if self.image_url or tag.lower() != "img":
            return

        attr_map = dict(attrs or [])
        for key in ("src", "data-src", "data-original", "data-lazy-src"):
            url = attr_map.get(key)
            if url:
                self.image_url = url
                return

        srcset = attr_map.get("srcset") or attr_map.get("data-srcset")
        if srcset:
            first = srcset.split(",")[0].strip().split(" ")[0]
            if first:
                self.image_url = first


def strip_html_tags(html_content: Optional[str]) -> Optional[str]:
    """
    Strip HTML tags from content and return clean text.

    Args:
        html_content: HTML string to clean

    Returns:
        Clean text with HTML tags removed, or None if input is None
    """
    if not html_content:
        return html_content

    # Use HTMLParser to strip tags
    stripper = HTMLStripper()
    try:
        stripper.feed(html_content)
        text = stripper.get_text()
    except Exception:
        # Fallback to regex if HTMLParser fails
        text = re.sub(r'<[^>]+>', ' ', html_content)

    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()

    return text if text else None


def extract_first_image_url(html_content: Optional[str]) -> Optional[str]:
    """Extract the first image URL from HTML content."""
    if not html_content:
        return None

    extractor = HTMLImageExtractor()
    try:
        extractor.feed(html_content)
    except Exception:
        return None

    return extractor.image_url


def clean_feed_content(content: Optional[str]) -> Optional[str]:
    """
    Clean feed content by removing HTML tags and normalizing text.
    Also removes common feed suffixes like "The post X first appeared on Y".

    Args:
        content: Feed content to clean

    Returns:
        Cleaned content
    """
    if not content:
        return content

    # Strip HTML tags
    cleaned = strip_html_tags(content)

    if not cleaned:
        return None

    # Remove common feed suffixes (e.g., "The post ... first appeared on ...")
    suffix_pattern = re.compile(
        r'\s*The post\b[\s\S]*?\bfirst appeared on\b[\s\S]*$',
        re.IGNORECASE
    )
    cleaned = suffix_pattern.sub('', cleaned)

    # Final whitespace cleanup
    cleaned = re.sub(r'\s+', ' ', cleaned)
    cleaned = cleaned.strip()

    return cleaned if cleaned else None
