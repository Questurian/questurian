from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import tempfile
from unittest.mock import patch

import lib.database.db as db_module
import lib.database.init_db as init_db_module


class FakeTranslator:
    def translate_text(self, text: str, source: str = "auto", target: str = "en"):
        if not text:
            return None, "empty"
        return f"{target.upper()}::{text}", "translated"


@contextmanager
def temporary_database():
    with tempfile.TemporaryDirectory() as temp_dir:
        database_path = Path(temp_dir) / "leads.db"
        with patch.object(db_module, "DATABASE_PATH", database_path), patch.object(
            init_db_module,
            "DATABASE_PATH",
            database_path,
        ):
            init_db_module.run_migrations()
            yield database_path
