"""SQLite persistence for first-run setup (n8n-style)."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path


def data_dir() -> Path:
    return Path(os.environ.get("CLIPENGINE_DATA_DIR", "/data")).resolve()


def db_path() -> Path:
    d = data_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d / "clipengine.db"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path()))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                setup_complete INTEGER NOT NULL DEFAULT 0,
                admin_username TEXT,
                admin_password_hash TEXT,
                llm_settings_json TEXT
            )
            """
        )
        conn.execute("INSERT OR IGNORE INTO app_settings (id, setup_complete) VALUES (1, 0)")
        conn.commit()
        _ensure_llm_settings_column(conn)
        _ensure_gdrive_config_column(conn)
        _ensure_s3_config_column(conn)
        _ensure_smb_config_column(conn)
        _ensure_storage_bind_paths_column(conn)


def _ensure_llm_settings_column(conn: sqlite3.Connection) -> None:
    rows = conn.execute("PRAGMA table_info(app_settings)").fetchall()
    names = {r[1] for r in rows}
    if "llm_settings_json" not in names:
        conn.execute("ALTER TABLE app_settings ADD COLUMN llm_settings_json TEXT")
        conn.commit()


def get_setup_state() -> tuple[bool, str | None]:
    init_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT setup_complete, admin_username FROM app_settings WHERE id = 1"
        ).fetchone()
        if row is None:
            return False, None
        complete = bool(row["setup_complete"])
        username = row["admin_username"]
        return complete, username


def complete_setup(username: str, password_hash: str) -> None:
    init_db()
    with connect() as conn:
        conn.execute(
            """
            UPDATE app_settings
            SET setup_complete = 1, admin_username = ?, admin_password_hash = ?
            WHERE id = 1
            """,
            (username, password_hash),
        )
        conn.commit()


def get_llm_settings_json() -> str | None:
    """Raw JSON string from DB, or None."""
    init_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT llm_settings_json FROM app_settings WHERE id = 1"
        ).fetchone()
    if row is None or row["llm_settings_json"] is None:
        return None
    return str(row["llm_settings_json"])


def save_llm_settings_json(raw_json: str) -> None:
    init_db()
    with connect() as conn:
        conn.execute(
            "UPDATE app_settings SET llm_settings_json = ? WHERE id = 1",
            (raw_json,),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Google Drive config
# ---------------------------------------------------------------------------


def _ensure_gdrive_config_column(conn: sqlite3.Connection) -> None:
    rows = conn.execute("PRAGMA table_info(app_settings)").fetchall()
    names = {r[1] for r in rows}
    if "google_drive_config_json" not in names:
        conn.execute("ALTER TABLE app_settings ADD COLUMN google_drive_config_json TEXT")
        conn.commit()


def get_google_drive_config_json() -> str | None:
    """Raw JSON string with OAuth config + tokens, or None."""
    init_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT google_drive_config_json FROM app_settings WHERE id = 1"
        ).fetchone()
    if row is None or row["google_drive_config_json"] is None:
        return None
    return str(row["google_drive_config_json"])


def save_google_drive_config_json(raw_json: str) -> None:
    init_db()
    with connect() as conn:
        conn.execute(
            "UPDATE app_settings SET google_drive_config_json = ? WHERE id = 1",
            (raw_json,),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# S3 / SMB output (BYOC credentials in SQLite)
# ---------------------------------------------------------------------------


def _ensure_s3_config_column(conn: sqlite3.Connection) -> None:
    rows = conn.execute("PRAGMA table_info(app_settings)").fetchall()
    names = {r[1] for r in rows}
    if "s3_config_json" not in names:
        conn.execute("ALTER TABLE app_settings ADD COLUMN s3_config_json TEXT")
        conn.commit()


def get_s3_config_json() -> str | None:
    init_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT s3_config_json FROM app_settings WHERE id = 1"
        ).fetchone()
    if row is None or row["s3_config_json"] is None:
        return None
    return str(row["s3_config_json"])


def save_s3_config_json(raw_json: str) -> None:
    init_db()
    with connect() as conn:
        conn.execute(
            "UPDATE app_settings SET s3_config_json = ? WHERE id = 1",
            (raw_json,),
        )
        conn.commit()


def _ensure_smb_config_column(conn: sqlite3.Connection) -> None:
    rows = conn.execute("PRAGMA table_info(app_settings)").fetchall()
    names = {r[1] for r in rows}
    if "smb_config_json" not in names:
        conn.execute("ALTER TABLE app_settings ADD COLUMN smb_config_json TEXT")
        conn.commit()


def get_smb_config_json() -> str | None:
    init_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT smb_config_json FROM app_settings WHERE id = 1"
        ).fetchone()
    if row is None or row["smb_config_json"] is None:
        return None
    return str(row["smb_config_json"])


def save_smb_config_json(raw_json: str) -> None:
    init_db()
    with connect() as conn:
        conn.execute(
            "UPDATE app_settings SET smb_config_json = ? WHERE id = 1",
            (raw_json,),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Local bind paths (host dirs mounted into the container; registered in UI)
# ---------------------------------------------------------------------------


def _ensure_storage_bind_paths_column(conn: sqlite3.Connection) -> None:
    rows = conn.execute("PRAGMA table_info(app_settings)").fetchall()
    names = {r[1] for r in rows}
    if "storage_bind_paths_json" not in names:
        conn.execute(
            "ALTER TABLE app_settings ADD COLUMN storage_bind_paths_json TEXT"
        )
        conn.commit()


def get_storage_bind_paths_json() -> str | None:
    init_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT storage_bind_paths_json FROM app_settings WHERE id = 1"
        ).fetchone()
    if row is None or row["storage_bind_paths_json"] is None:
        return None
    return str(row["storage_bind_paths_json"])


def save_storage_bind_paths_json(raw_json: str) -> None:
    init_db()
    with connect() as conn:
        conn.execute(
            "UPDATE app_settings SET storage_bind_paths_json = ? WHERE id = 1",
            (raw_json,),
        )
        conn.commit()
