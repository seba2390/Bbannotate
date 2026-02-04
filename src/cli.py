"""Command-line interface for bbannotate."""

import subprocess
import sys
import webbrowser
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.panel import Panel

from src import __version__

app = typer.Typer(
    name="bbannotate",
    help="Bounding box annotation tool for image datasets.",
    add_completion=False,
    no_args_is_help=True,
)
console = Console()


def version_callback(value: bool) -> None:
    """Print version and exit."""
    if value:
        console.print(f"[bold blue]bbannotate[/bold blue] version {__version__}")
        raise typer.Exit()


@app.callback()
def main_callback(
    version: Annotated[
        bool | None,
        typer.Option(
            "--version",
            "-v",
            help="Show version and exit.",
            callback=version_callback,
            is_eager=True,
        ),
    ] = None,
) -> None:
    """Bbannotate - Bounding box annotation tool for image datasets."""
    pass


@app.command()
def start(
    host: Annotated[
        str,
        typer.Option("--host", "-h", help="Host to bind the server to."),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option("--port", "-p", help="Port to bind the server to."),
    ] = 8000,
    no_browser: Annotated[
        bool,
        typer.Option("--no-browser", help="Don't open browser automatically."),
    ] = False,
    reload: Annotated[
        bool,
        typer.Option("--reload", "-r", help="Enable auto-reload for development."),
    ] = False,
    data_dir: Annotated[
        Path | None,
        typer.Option(
            "--data-dir",
            "-d",
            help="Directory for storing data (defaults to ./data).",
        ),
    ] = None,
    projects_dir: Annotated[
        Path | None,
        typer.Option(
            "--projects-dir",
            help="Directory for storing projects (defaults to ./projects).",
        ),
    ] = None,
) -> None:
    """Start the bbannotate annotation server.

    Launches the FastAPI backend server and optionally opens a browser.
    The frontend is served from the built assets if available.
    """
    import os

    # Set environment variables for configuration
    if data_dir:
        os.environ["BBANNOTATE_DATA_DIR"] = str(data_dir.resolve())
    if projects_dir:
        os.environ["BBANNOTATE_PROJECTS_DIR"] = str(projects_dir.resolve())

    # Check if frontend is built
    frontend_dist = _find_frontend_dist()
    if frontend_dist is None:
        console.print(
            Panel(
                "[yellow]Frontend not found.[/yellow]\n\n"
                "The frontend assets are not built. Run:\n"
                "  [bold]bbannotate build-frontend[/bold]\n\n"
                "Or start the frontend dev server separately:\n"
                "  [bold]cd frontend && npm run dev[/bold]",
                title="⚠️  Frontend Missing",
                border_style="yellow",
            )
        )

    url = f"http://{host}:{port}"

    console.print(
        Panel(
            f"[bold green]Starting bbannotate server[/bold green]\n\n"
            f"  URL: [link={url}]{url}[/link]\n"
            f"  Host: {host}\n"
            f"  Port: {port}\n"
            f"  Reload: {'enabled' if reload else 'disabled'}",
            title="🚀 Bbannotate",
            border_style="blue",
        )
    )

    # Open browser if requested
    if not no_browser:
        webbrowser.open(url)

    # Start uvicorn
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=host,
        port=port,
        reload=reload,
    )


@app.command()
def build_frontend() -> None:
    """Build the frontend assets.

    Runs npm install and npm run build in the frontend directory.
    """
    frontend_dir = _find_frontend_src()

    if frontend_dir is None:
        console.print(
            "[red]Error:[/red] Frontend source directory not found.\n"
            "Make sure you're running from the project root or have "
            "the frontend directory in your installation.",
            style="bold red",
        )
        raise typer.Exit(1)

    console.print(f"[blue]Building frontend in {frontend_dir}...[/blue]")

    # Check for npm
    try:
        subprocess.run(
            ["npm", "--version"],
            check=True,
            capture_output=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        console.print(
            "[red]Error:[/red] npm not found. Please install Node.js and npm.",
            style="bold red",
        )
        raise typer.Exit(1) from None

    # Install dependencies
    console.print("[blue]Installing npm dependencies...[/blue]")
    result = subprocess.run(
        ["npm", "install"],
        cwd=frontend_dir,
        capture_output=False,
    )
    if result.returncode != 0:
        console.print("[red]Error:[/red] npm install failed.", style="bold red")
        raise typer.Exit(1)

    # Build
    console.print("[blue]Building frontend...[/blue]")
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=frontend_dir,
        capture_output=False,
    )
    if result.returncode != 0:
        console.print("[red]Error:[/red] npm build failed.", style="bold red")
        raise typer.Exit(1)

    console.print("[green]✓ Frontend built successfully![/green]")


@app.command()
def info() -> None:
    """Show information about the current installation."""
    frontend_status = "Found" if _find_frontend_dist() else "Not built"
    frontend_src = "Found" if _find_frontend_src() else "Not found"
    console.print(
        Panel(
            f"[bold blue]bbannotate[/bold blue] v{__version__}\n\n"
            f"[bold]Python:[/bold] {sys.version}\n"
            f"[bold]Frontend:[/bold] {frontend_status}\n"
            f"[bold]Frontend Source:[/bold] {frontend_src}",
            title="ℹ️  Installation Info",
            border_style="blue",
        )
    )


def _find_frontend_dist() -> Path | None:
    """Find the frontend dist directory.

    Checks in order:
    1. Bundled with package (src/frontend_dist) - for pip install
    2. Relative to package (frontend/dist) - for development
    3. Current working directory (frontend/dist) - for development
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

    # Check current working directory
    cwd_dist = Path.cwd() / "frontend" / "dist"
    if cwd_dist.exists() and (cwd_dist / "index.html").exists():
        return cwd_dist

    return None


def _find_frontend_src() -> Path | None:
    """Find the frontend source directory."""
    # Check relative to package
    package_dir = Path(__file__).parent.parent
    frontend_path = package_dir / "frontend"
    if (frontend_path / "package.json").exists():
        return frontend_path

    # Check current working directory
    cwd_frontend = Path.cwd() / "frontend"
    if (cwd_frontend / "package.json").exists():
        return cwd_frontend

    return None


def main() -> None:
    """Entry point for the CLI."""
    app()


if __name__ == "__main__":
    main()
