"""Payload response documents, parsing, and structured errors."""

import json
from typing import Any, TypedDict


class PayloadMediaAssetDoc(TypedDict):
    id: str
    filename: str
    mediaSet: str | int | None
    variant: str | None
    width: int | None
    height: int | None
    bunny_original_url: str | None
    url: str | None


class PayloadUploadError(Exception):
    """Structured error for Payload operations with full context."""

    def __init__(
        self,
        step: str,
        message: str,
        status_code: int = 0,
        response_body: str = '',
        request_url: str = '',
        detail: str = '',
    ):
        self.step = step
        self.status_code = status_code
        self.response_body = response_body
        self.request_url = request_url
        self.detail = detail
        full_msg = f'[{step}] {message}'
        if status_code:
            full_msg += f' (HTTP {status_code})'
        if detail:
            full_msg += f' — {detail}'
        super().__init__(full_msg)

    def to_dict(self) -> dict:
        return {
            'step': self.step,
            'message': str(self),
            'detail': self.detail,
            'status_code': self.status_code,
            'response_body': self.response_body[:1000] if self.response_body else '',
            'request_url': self.request_url,
        }


def _parse_payload_error(response_text: str) -> str:
    """Extract a human-readable error from Payload's JSON error responses."""
    try:
        data = json.loads(response_text)
        errors = data.get('errors', [])
        if errors:
            messages = [e.get('message', '') for e in errors if e.get('message')]
            field_errors = [
                f'{e.get('field', '?')}: {e.get('message', '')}'
                for e in errors
                if e.get('field')
            ]
            if field_errors:
                return 'Validation: ' + '; '.join(field_errors)
            if messages:
                return '; '.join(messages)
        if data.get('message'):
            return data['message']
    except (json.JSONDecodeError, KeyError):
        pass
    return response_text[:300] if response_text else 'Empty response'


def _is_variant_conflict_error(parsed_error: str, variant: str) -> bool:
    """Detect Payload's duplicate mediaSet+variant conflict message."""
    normalized = parsed_error.lower()
    variant_key = variant.lower()
    return 'mediaset already has a' in normalized or (
        'already has a' in normalized
        and variant_key in normalized
        and ('variant' in normalized)
    )


def _is_missing_storage_file_delete_error(error: PayloadUploadError) -> bool:
    """Detect Payload/Bunny delete failures caused by an already-missing file."""
    normalized = f'{error.detail} {error.response_body}'.lower()
    return (
        error.status_code >= 500
        and 'delete file' in normalized
        and (
            "couldn't" in normalized
            or 'could not' in normalized
            or 'failed' in normalized
        )
    )


def _extract_relationship_id(value: Any) -> str | int | None:
    if value is None:
        return None
    if isinstance(value, (str, int)):
        return value
    if isinstance(value, dict):
        related_id = value.get('id')
        if isinstance(related_id, (str, int)):
            return related_id
    return None


def _to_optional_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return int(text)
        except ValueError:
            return None
    return None


def _parse_media_asset_doc(doc: Any) -> PayloadMediaAssetDoc:
    if not isinstance(doc, dict):
        raise PayloadUploadError(
            step='parse_media_asset_doc',
            message='Payload returned an invalid media-asset document',
            detail=f'Expected dict, got {type(doc).__name__}',
        )
    raw_id = doc.get('id')
    if raw_id is None:
        raise PayloadUploadError(
            step='parse_media_asset_doc',
            message='Payload media-asset document is missing id',
            detail=f'Response keys: {list(doc.keys())}',
        )
    filename = doc.get('filename')
    if not isinstance(filename, str) or not filename.strip():
        raise PayloadUploadError(
            step='parse_media_asset_doc',
            message='Payload media-asset document is missing filename',
            detail=f'asset_id={raw_id}',
        )
    media_set = _extract_relationship_id(doc.get('mediaSet'))
    variant = doc.get('variant')
    width = _to_optional_int(doc.get('width'))
    height = _to_optional_int(doc.get('height'))
    bunny_original_url = (
        doc.get('bunny_original_url')
        if isinstance(doc.get('bunny_original_url'), str)
        else None
    )
    asset_url = doc.get('url') if isinstance(doc.get('url'), str) else None
    return PayloadMediaAssetDoc(
        id=str(raw_id),
        filename=filename,
        mediaSet=media_set,
        variant=variant if isinstance(variant, str) else None,
        width=width,
        height=height,
        bunny_original_url=bunny_original_url,
        url=asset_url,
    )
