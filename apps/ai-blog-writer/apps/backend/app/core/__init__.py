# Core shared utilities
from .database import get_db_connection, ensure_core_tables
from .storage import (
    write_status,
    read_status,
    write_stage_result,
    read_stage_result,
    write_artifact,
    read_output,
    fail_stale_runs,
    cleanup_run,
    clear_all_runs,
    get_all_runs,
)
from .article_types import (
    write_article_type,
    read_article_types,
    read_article_type_name_definitions,
    read_article_type_names,
    read_article_definitions,
    read_article_guidelines,
    get_article_type_by_id,
    get_article_type_by_name,
    update_article_type_by_id,
    delete_article_type,
    get_article_type_guideline,
    get_article_type_title_guideline,
    ensure_article_types_table,
)
from .http_ssl import resolve_httpx_verify

__all__ = [
    # Database
    "get_db_connection",
    "ensure_core_tables",
    # Storage
    "write_status",
    "read_status",
    "write_stage_result",
    "read_stage_result",
    "write_artifact",
    "read_output",
    "fail_stale_runs",
    "cleanup_run",
    "clear_all_runs",
    "get_all_runs",
    # Article Types (shared across features)
    "write_article_type",
    "read_article_types",
    "read_article_type_name_definitions",
    "read_article_type_names",
    "read_article_definitions",
    "read_article_guidelines",
    "get_article_type_by_id",
    "get_article_type_by_name",
    "update_article_type_by_id",
    "delete_article_type",
    "get_article_type_guideline",
    "get_article_type_title_guideline",
    "ensure_article_types_table",
    # HTTP/TLS
    "resolve_httpx_verify",
]
