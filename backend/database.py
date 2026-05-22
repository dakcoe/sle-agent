import sqlite3
import os
import secrets
import string

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sle.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT    UNIQUE NOT NULL,
            password        TEXT    NOT NULL,
            role            TEXT    NOT NULL DEFAULT 'user',
            admin_code      TEXT    UNIQUE,
            linked_admin_id INTEGER,
            is_blocked      INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (linked_admin_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()


def generate_admin_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(8))
