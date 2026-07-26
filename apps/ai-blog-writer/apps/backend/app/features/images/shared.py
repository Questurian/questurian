"""Compatibility facade for image-route helper modules."""

import logging

from .auth import _extract_bearer_token as _extract_bearer_token  # noqa: F401
from .errors import (  # noqa: F401
    _build_error_detail as _build_error_detail,
    _raise_http_error as _raise_http_error,
    _status_from_bfl_error as _status_from_bfl_error,
    _status_from_payload_error as _status_from_payload_error,
)
from .external_import import (  # noqa: F401
    EXTERNAL_IMPORT_ALLOWED_HOSTS as EXTERNAL_IMPORT_ALLOWED_HOSTS,
    MAX_EXTERNAL_IMPORT_FILE_SIZE as MAX_EXTERNAL_IMPORT_FILE_SIZE,
    PEXELS_ALLOWED_ORIENTATIONS as PEXELS_ALLOWED_ORIENTATIONS,
    PEXELS_SEARCH_URL as PEXELS_SEARCH_URL,
    UNSPLASH_ALLOWED_ORIENTATIONS as UNSPLASH_ALLOWED_ORIENTATIONS,
    UNSPLASH_SEARCH_URL as UNSPLASH_SEARCH_URL,
    _derive_external_filename as _derive_external_filename,
    _download_external_image as _download_external_image,
    _get_pexels_api_key as _get_pexels_api_key,
    _get_unsplash_access_key as _get_unsplash_access_key,
    _is_allowed_external_host as _is_allowed_external_host,
    _validate_external_provider as _validate_external_provider,
    _validate_external_source_url as _validate_external_source_url,
)
from .flux_validation import (  # noqa: F401
    ALLOWED_BFL_MODEL_IDS as ALLOWED_BFL_MODEL_IDS,
    BFL_DIMENSION_MULTIPLE as BFL_DIMENSION_MULTIPLE,
    MIN_BFL_DIMENSION as MIN_BFL_DIMENSION,
    _validate_flux_dimensions as _validate_flux_dimensions,
    _validate_flux_model_id as _validate_flux_model_id,
    _validate_flux_prompt as _validate_flux_prompt,
    _validate_flux_safety_tolerance as _validate_flux_safety_tolerance,
)
from .metadata_validation import (  # noqa: F401
    REQUIRED_VARIANT_TYPES as REQUIRED_VARIANT_TYPES,
    UPLOAD_ORDER as UPLOAD_ORDER,
    VARIANT_DIMENSIONS as VARIANT_DIMENSIONS,
    _normalize_tag_name as _normalize_tag_name,
    _parse_tag_ids as _parse_tag_ids,
    _validate_alt_text as _validate_alt_text,
    _validate_location_ref as _validate_location_ref,
    _validate_photographer_credit as _validate_photographer_credit,
    _validate_variant_types as _validate_variant_types,
)
from .social_assets import (  # noqa: F401
    SOURCE_VARIANT_PRIORITY as SOURCE_VARIANT_PRIORITY,
    _asset_area as _asset_area,
    _asset_variant_priority as _asset_variant_priority,
    _download_media_asset_file as _download_media_asset_file,
    _select_social_source_asset as _select_social_source_asset,
    _wait_for_bunny_original_url as _wait_for_bunny_original_url,
)
from .upload_files import (  # noqa: F401
    MAX_BFL_ADDITIONAL_REFERENCE_IMAGES as MAX_BFL_ADDITIONAL_REFERENCE_IMAGES,
    MAX_FILE_SIZE as MAX_FILE_SIZE,
    _read_additional_reference_images as _read_additional_reference_images,
    _read_upload_file as _read_upload_file,
)


logger = logging.getLogger("images.routes")
