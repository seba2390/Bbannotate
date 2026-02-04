"""FastAPI application entry point for the annotation tool."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src import __version__
from src.api.routes import get_data_dir, router


def _find_frontend_dist() -> Path | None:
    """Find the frontend dist directory.

    Checks in order:
    1. Bundled with package (src/frontend_dist) - for pip install
    2. Relative to package (frontend/dist) - for development
    """
    # Check bundled location (pip install includes frontend_dist in src/)
    package_dir = Path(__file__).parent
    bundled_path = package_dir / "frontend_dist"
    if bundled_path.exists() and (bundled_path / "index.html").exists():
        return bundled_path

    # Check relative to package root (development mode with frontend/dist)
    dev_path = package_dir.parent / "frontend" / "dist"
    if dev_path.exists() and (dev_path / "index.html").exists():
        return dev_path

    return None


# Create FastAPI app
app = FastAPI(
    title="Bounding Box Annotation Tool",
    description="A lightweight annotation tool for grocery flyer product detection",
    version=__version__,
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
FRONTEND_DIST = _find_frontend_dist()
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
