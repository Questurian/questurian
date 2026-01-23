import sqlite3
from pathlib import Path
from typing import Any, List, Optional, Tuple

DATABASE_PATH = Path(__file__).parent.parent.parent / "leads.db"


def get_db_connection():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def execute_query(query: str, params: Tuple = ()) -> int:
    """Execute a query and return the last row id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    last_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return last_id


def execute_many(query: str, params_list: List[Tuple]) -> None:
    """Execute many queries."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany(query, params_list)
    conn.commit()
    conn.close()


def fetch_one(query: str, params: Tuple = ()) -> Optional[dict]:
    """Fetch one row as a dictionary."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def fetch_all(query: str, params: Tuple = ()) -> List[dict]:
    """Fetch all rows as a list of dictionaries."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]
