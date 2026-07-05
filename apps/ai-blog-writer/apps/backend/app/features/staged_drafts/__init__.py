# Staged Drafts Feature
#
# Server-side persistence for in-progress "standard article" staged drafts
# (youtube2blog / url2blog / prompt2blog builders). Drafts are stored as opaque
# JSON blobs keyed by (storage_key, draft_id) so builder links resolve regardless
# of which browser/device created them.
from .routes import router

__all__ = ["router"]
