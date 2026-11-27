import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ParsedSheetData:
    sheet_name: str
    header_row: int
    is_possible_summary_sheet: bool
    warnings: list[str]
    columns_order: list[str]
    columns_meta: dict[str, dict[str, Any]]
    raw_rows: list[dict[str, Any]]
    cleaned_columns: dict[str, list[Any]]


@dataclass
class ParsedWorkbookSession:
    file_id: str
    file_name: str
    created_at: float
    sheets: dict[str, ParsedSheetData] = field(default_factory=dict)
    sheet_order: list[str] = field(default_factory=list)


class SessionStore:
    """Caché temporal en memoria para libros Excel parseados con expiración TTL."""

    def __init__(self, ttl_seconds: int = 3600):
        self._ttl_seconds = ttl_seconds
        self._store: dict[str, ParsedWorkbookSession] = {}
        self._lock = threading.Lock()

    def _cleanup_expired(self) -> None:
        now = time.time()
        expired = [
            fid
            for fid, session in self._store.items()
            if (now - session.created_at) > self._ttl_seconds
        ]
        for fid in expired:
            del self._store[fid]

    def save(self, session: ParsedWorkbookSession) -> str:
        with self._lock:
            self._cleanup_expired()
            if not session.file_id:
                session.file_id = str(uuid.uuid4())
            self._store[session.file_id] = session
            return session.file_id

    def get(self, file_id: str) -> Optional[ParsedWorkbookSession]:
        with self._lock:
            self._cleanup_expired()
            session = self._store.get(file_id)
            if session is not None:
                # Refresh sliding TTL on active access
                session.created_at = time.time()
            return session

    def delete(self, file_id: str) -> None:
        with self._lock:
            self._store.pop(file_id, None)


session_store = SessionStore(ttl_seconds=3600)
