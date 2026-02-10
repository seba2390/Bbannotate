"""Browser session lifecycle service.

Tracks browser heartbeat activity for detached bbannotate sessions and
decides when the server should terminate.
"""

from __future__ import annotations

import secrets
import threading
import time
from collections.abc import Callable


class BrowserSessionService:
    """Manage heartbeat state for one browser-backed session."""

    def __init__(
        self,
        token: str,
        inactivity_timeout_seconds: float = 8.0,
        close_grace_seconds: float = 1.5,
        startup_timeout_seconds: float = 120.0,
    ) -> None:
        """Initialize browser session tracking.

        Args:
            token: Random session token shared between CLI-launched browser and API.
            inactivity_timeout_seconds: Max heartbeat silence before shutdown.
            close_grace_seconds: Grace window after explicit close signal.
            startup_timeout_seconds: Max time waiting for first heartbeat.
        """
        self.token = token
        self.inactivity_timeout_seconds = inactivity_timeout_seconds
        self.close_grace_seconds = close_grace_seconds
        self.startup_timeout_seconds = startup_timeout_seconds

        self._lock = threading.Lock()
        self._started_at = time.monotonic()
        self._last_heartbeat_at: float | None = None
        self._close_requested_at: float | None = None
        self._shutdown_triggered = False

    def record_heartbeat(self, token: str) -> bool:
        """Record a heartbeat for an authenticated session."""
        if not self._is_valid_token(token):
            return False

        with self._lock:
            self._last_heartbeat_at = time.monotonic()
            self._close_requested_at = None
        return True

    def record_close(self, token: str) -> bool:
        """Record an explicit browser close signal."""
        if not self._is_valid_token(token):
            return False

        with self._lock:
            self._close_requested_at = time.monotonic()
        return True

    def run_monitor(
        self,
        stop_event: threading.Event,
        shutdown_callback: Callable[[], None],
    ) -> None:
        """Monitor lifecycle state and invoke shutdown callback once needed."""
        while not stop_event.wait(timeout=0.5):
            if self._should_shutdown():
                shutdown_callback()
                return

    def _should_shutdown(self) -> bool:
        """Return True if the process should terminate."""
        now = time.monotonic()

        with self._lock:
            if self._shutdown_triggered:
                return False

            # Browser explicitly closed: terminate quickly unless heartbeat resumes.
            if self._close_requested_at is not None:
                if now - self._close_requested_at >= self.close_grace_seconds:
                    self._shutdown_triggered = True
                    return True
                return False

            # If never connected, avoid orphan detached servers forever.
            if self._last_heartbeat_at is None:
                if now - self._started_at >= self.startup_timeout_seconds:
                    self._shutdown_triggered = True
                    return True
                return False

            if now - self._last_heartbeat_at >= self.inactivity_timeout_seconds:
                self._shutdown_triggered = True
                return True

        return False

    def _is_valid_token(self, token: str) -> bool:
        """Validate session token in constant time."""
        return bool(token) and secrets.compare_digest(token, self.token)
