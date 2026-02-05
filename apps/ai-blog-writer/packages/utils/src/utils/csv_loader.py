import csv
import os
from typing import IO, List

from shared import RawVideoRecord


def parse_csv(file_obj: IO[str]) -> List[RawVideoRecord]:
    """Parse a CSV file into RawVideoRecord objects."""
    default_limit = 10 * 1024 * 1024
    raw_limit = os.getenv("CSV_FIELD_SIZE_LIMIT")
    try:
        limit = int(raw_limit) if raw_limit else default_limit
    except ValueError:
        limit = default_limit
    current_limit = csv.field_size_limit()
    if limit > current_limit:
        try:
            csv.field_size_limit(limit)
        except OverflowError:
            csv.field_size_limit(default_limit)
    reader = csv.DictReader(file_obj)
    records: List[RawVideoRecord] = []
    for row in reader:
        sanitized = {key: (value or "") for key, value in row.items()}
        record = RawVideoRecord(**sanitized)
        records.append(record)
    return records
