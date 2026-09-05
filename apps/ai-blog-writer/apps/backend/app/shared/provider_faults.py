"""One reader for "why did this model call fail", across providers.

Moved to ``packages/model-gateway``. This module is the name ai-blog-writer
already imports it under, kept so the move did not have to be one commit with
every call site that reads it.

Why it moved: Location Manager needs it too. Its alt-text service has never
classified a Vertex failure at all, so an exhausted quota there reads as an
ordinary 500, indistinguishable from a bad image. A classifier that lives
inside one app cannot help the other one.

New code should import from ``model_gateway.faults`` directly. Nothing here
adds anything.
"""

from __future__ import annotations

from model_gateway.faults import (
    FATAL_FAULT_KINDS,
    FAULT_INVALID_RESPONSE,
    FAULT_NOT_CONNECTED,
    FAULT_PROVIDER_UNAVAILABLE,
    FAULT_QUOTA_EXHAUSTED,
    KNOWN_FAULT_KINDS,
    is_fatal_provider_fault,
    provider_fault_kind,
)

__all__ = [
    "FAULT_QUOTA_EXHAUSTED",
    "FAULT_NOT_CONNECTED",
    "FAULT_PROVIDER_UNAVAILABLE",
    "FAULT_INVALID_RESPONSE",
    "FATAL_FAULT_KINDS",
    "KNOWN_FAULT_KINDS",
    "provider_fault_kind",
    "is_fatal_provider_fault",
]
