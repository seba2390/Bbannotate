"""FastAPI application entry point for the annotation tool."""

import os
import signal
import threading
from contextlib import asynccontextmanager
from typing import cast

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.types import ExceptionHandler

from src import __version__
from src.api.routes import get_data_dir, limiter, router
from src.services.browser_session_service import BrowserSessionService
from src.utils import find_frontend_dist


def _get_timeout(env_var: str, default: float) -> float:
    """Read a timeout value from environment with safe fallback."""
    raw = os.getenv(env_var)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    if value <= 0:
        return default
    return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage detached browser-session monitor lifecycle."""
    token = os.getenv("BBANNOTATE_SESSION_TOKEN", "").strip()
    stop_event: threading.Event | None = None

    if token:
        service = BrowserSessionService(
            token=token,
            inactivity_timeout_seconds=_get_timeout(
                "BBANNOTATE_SESSION_IDLE_TIMEOUT_SECONDS",
                8.0,
            ),
            close_grace_seconds=_get_timeout(
                "BBANNOTATE_SESSION_CLOSE_GRACE_SECONDS",
                1.5,
            ),
            startup_timeout_seconds=_get_timeout(
                "BBANNOTATE_SESSION_STARTUP_TIMEOUT_SECONDS",
                120.0,
            ),
        )

        stop_event = threading.Event()

        def shutdown_process() -> None:
            os.kill(os.getpid(), signal.SIGTERM)

        monitor_thread = threading.Thread(
            target=service.run_monitor,
            args=(stop_event, shutdown_process),
            daemon=True,
            name="bbannotate-session-monitor",
        )
        monitor_thread.start()

        app.state.browser_session_service = service
        app.state.browser_session_stop_event = stop_event

    try:
        yield
    finally:
        if stop_event is not None:
            stop_event.set()


# Create FastAPI app
app = FastAPI(
    title="Bounding Box Annotation Tool",
    description="A lightweight annotation tool for grocery flyer product detection",
    version=__version__,
    lifespan=lifespan,
)

# Add rate limiter state and exception handler
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded, cast(ExceptionHandler, _rate_limit_exceeded_handler)
)

# Configure CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

# Ensure data directory exists
get_data_dir().mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


# Serve frontend static files in production
# NOTE: Must be mounted after all other routes to avoid catching API requests
FRONTEND_DIST = find_frontend_dist()
if FRONTEND_DIST:
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


def main() -> None:
    """Run the development server."""
    import uvicorn

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))

    uvicorn.run(
        "src.main:app",
        host=host,
        port=port,
        reload=True,
    )


if __name__ == "__main__":
    main()
