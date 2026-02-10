"""Command-line interface for bbannotate."""

import os
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from contextlib import suppress
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.panel import Panel

from src import __version__
from src.utils import find_frontend_dist

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


def _configure_environment(
    data_dir: Path | None,
    projects_dir: Path | None,
    session_token: str | None = None,
) -> dict[str, str]:
    """Build environment variables for server process startup."""
    env = os.environ.copy()
    if data_dir:
        env["BBANNOTATE_DATA_DIR"] = str(data_dir.resolve())
    if projects_dir:
        env["BBANNOTATE_PROJECTS_DIR"] = str(projects_dir.resolve())
    if session_token:
        env["BBANNOTATE_SESSION_TOKEN"] = session_token
    return env


def _wait_for_server_ready(url: str, timeout_seconds: float = 12.0) -> bool:
    """Poll health endpoint until server responds or timeout is reached."""
    health_url = f"{url}/api/health"
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=0.5):
                return True
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.1)
    return False


def _open_browser_after_ready(server_url: str, browser_url: str) -> None:
    """Open browser once server is healthy, with fallback after timeout."""
    if _wait_for_server_ready(server_url):
        webbrowser.open(browser_url)
        return
    webbrowser.open(browser_url)


def _start_detached_server(
    host: str,
    port: int,
    env: dict[str, str],
) -> subprocess.Popen:
    """Start uvicorn in a detached subprocess that survives terminal close."""
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "src.main:app",
        "--host",
        host,
        "--port",
        str(port),
    ]

    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(
            subprocess, "DETACHED_PROCESS", 0
        )
        return subprocess.Popen(
            command,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )

    return subprocess.Popen(
        command,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


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
    # Check if frontend is built
    frontend_dist = find_frontend_dist()
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
    detached_mode = not reload
    browser_session_token = (
        secrets.token_urlsafe(24) if detached_mode and not no_browser else None
    )
    env = _configure_environment(data_dir, projects_dir, browser_session_token)

    console.print(
        Panel(
            f"[bold green]Starting bbannotate server[/bold green]\n\n"
            f"  URL: [link={url}]{url}[/link]\n"
            f"  Host: {host}\n"
            f"  Port: {port}\n"
            f"  Reload: {'enabled' if reload else 'disabled'}\n"
            f"  Detached: {'enabled' if detached_mode else 'disabled'}",
            title="🚀 Bbannotate",
            border_style="blue",
        )
    )

    if detached_mode:
        process = _start_detached_server(host, port, env)
        if not _wait_for_server_ready(url, timeout_seconds=15.0):
            with suppress(ProcessLookupError):
                process.terminate()
            console.print(
                "[red]Failed to start server in detached mode.[/red] "
                "Please check whether the port is already in use."
            )
            raise typer.Exit(1)

        console.print(
            f"[green]✓[/green] Server started in background (PID: {process.pid})"
        )

        if not no_browser:
            browser_url = url
            if browser_session_token:
                encoded = urllib.parse.quote(browser_session_token, safe="")
                browser_url = f"{url}?bb_session={encoded}"
            webbrowser.open(browser_url)
            console.print(
                "[cyan]Browser session linked to server lifecycle.[/cyan] "
                "Closing the browser window will stop the background server."
            )
        else:
            console.print(
                "[yellow]Browser auto-open disabled.[/yellow] "
                "Server will continue running until manually stopped."
            )
        return

    # Foreground mode is reserved for dev reload workflow.
    os.environ.update(env)
    if not no_browser:
        threading.Thread(
            target=_open_browser_after_ready,
            args=(url, url),
            daemon=True,
        ).start()

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
    frontend_status = "Found" if find_frontend_dist() else "Not built"
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
