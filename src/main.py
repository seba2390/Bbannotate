"""FastAPI application entry point for the annotation tool."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src import __version__
from src.api.routes import get_data_dir, router

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

# Serve frontend static files in production
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


@app.get("/health")
def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


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
