"""Command-line interface for bbannotate."""

import os
import secrets
import socket
import subprocess
import sys
import tempfile
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


def _wait_for_server_ready_or_exit(
    url: str,
    process: subprocess.Popen,
    timeout_seconds: float = 20.0,
) -> tuple[bool, int | None]:
    """Wait for health check success or early process exit."""
    health_url = f"{url}/api/health"
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        returncode = process.poll()
        if returncode is not None:
            return False, returncode
        try:
            with urllib.request.urlopen(health_url, timeout=0.5):
                return True, None
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(0.1)

    return False, process.poll()


def _open_browser_after_ready(server_url: str, browser_url: str) -> None:
    """Open browser once server is healthy, with fallback after timeout."""
    if _wait_for_server_ready(server_url):
        webbrowser.open(browser_url)
        return
    webbrowser.open(browser_url)


def _is_tcp_port_open(host: str, port: int, timeout_seconds: float = 0.4) -> bool:
    """Check if a TCP port is accepting connections."""
    with (
        suppress(OSError),
        socket.create_connection(
            (host, port),
            timeout=timeout_seconds,
        ),
    ):
        return True
    return False


def _resolve_probe_host(host: str) -> str:
    """Resolve a connectable probe host from a bind host."""
    if host == "0.0.0.0":
        return "127.0.0.1"
    if host in {"::", "[::]"}:
        return "::1"
    return host


def _check_api_health(url: str, timeout_seconds: float = 0.8) -> bool:
    """Check if API health endpoint is responding."""
    health_url = f"{url}/api/health"
    try:
        with urllib.request.urlopen(health_url, timeout=timeout_seconds) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def _list_running_processes() -> list[tuple[int, str]]:
    """Return process list as (pid, command) tuples."""
    if os.name == "nt":
        return []

    try:
        result = subprocess.run(
            ["ps", "-axo", "pid=,command="],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return []

    if result.returncode != 0:
        return []

    processes: list[tuple[int, str]] = []
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        pid_raw, _, command = line.partition(" ")
        if not pid_raw.isdigit():
            continue
        processes.append((int(pid_raw), command.strip()))
    return processes


def _find_backend_processes(
    processes: list[tuple[int, str]],
) -> list[tuple[int, str]]:
    """Find likely bbannotate backend processes."""
    matches: list[tuple[int, str]] = []
    for pid, command in processes:
        if "uvicorn" in command and "src.main:app" in command:
            matches.append((pid, command))
    return matches


def _find_frontend_processes(
    processes: list[tuple[int, str]],
) -> list[tuple[int, str]]:
    """Find likely frontend dev server processes."""
    matches: list[tuple[int, str]] = []
    for pid, command in processes:
        if "vite" in command and "vitest" not in command:
            matches.append((pid, command))
    return matches


def _start_detached_server(
    host: str,
    port: int,
    env: dict[str, str],
    startup_log_path: Path | None = None,
) -> subprocess.Popen:
    """Start uvicorn in a detached subprocess that survives terminal close."""
    app_dir = str(Path(__file__).resolve().parent.parent)
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "src.main:app",
        "--app-dir",
        app_dir,
        "--host",
        host,
        "--port",
        str(port),
    ]

    stdout_target = subprocess.DEVNULL
    stderr_target = subprocess.DEVNULL
    log_file = None

    if startup_log_path is not None:
        startup_log_path.parent.mkdir(parents=True, exist_ok=True)
        startup_log_path.write_text("", encoding="utf-8")
        log_file = startup_log_path.open("ab")
        stdout_target = log_file
        stderr_target = subprocess.STDOUT

    try:
        if os.name == "nt":
            creationflags = getattr(
                subprocess,
                "CREATE_NEW_PROCESS_GROUP",
                0,
            ) | getattr(subprocess, "DETACHED_PROCESS", 0)
            process = subprocess.Popen(
                command,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=stdout_target,
                stderr=stderr_target,
                creationflags=creationflags,
            )
        else:
            process = subprocess.Popen(
                command,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=stdout_target,
                stderr=stderr_target,
                start_new_session=True,
            )
    finally:
        if log_file is not None:
            log_file.close()

    return process


def _read_startup_log_excerpt(
    startup_log_path: Path,
    max_lines: int = 40,
) -> str | None:
    """Read the tail of a detached startup log file for diagnostics."""
    if not startup_log_path.exists():
        return None

    try:
        text = startup_log_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return None
    return "\n".join(lines[-max_lines:])


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

    probe_host = _resolve_probe_host(host)
    url = f"http://{host}:{port}"
    probe_url = f"http://{probe_host}:{port}"
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
        if _is_tcp_port_open(probe_host, port):
            console.print(
                f"[red]Port {port} on {probe_host} is already in use.[/red] "
                "Stop the running process or choose a different port."
            )
            raise typer.Exit(1)

        startup_log_path = (
            Path(tempfile.gettempdir())
            / f"bbannotate-start-{port}-{int(time.time() * 1000)}.log"
        )
        process = _start_detached_server(
            host,
            port,
            env,
            startup_log_path=startup_log_path,
        )

        is_ready, exit_code = _wait_for_server_ready_or_exit(
            probe_url,
            process,
            timeout_seconds=20.0,
        )
        if not is_ready:
            process_still_running = process.poll() is None
            if process_still_running:
                with suppress(ProcessLookupError):
                    process.terminate()

            log_excerpt = _read_startup_log_excerpt(startup_log_path)
            if exit_code is not None:
                console.print(
                    "[red]Failed to start server in detached mode.[/red] "
                    f"Process exited with code {exit_code}."
                )
            else:
                console.print(
                    "[red]Failed to start server in detached mode.[/red] "
                    "Server did not become healthy within 20 seconds."
                )

            if log_excerpt:
                console.print("[yellow]Startup log excerpt:[/yellow]")
                console.print(log_excerpt)
            else:
                console.print(
                    "[yellow]No startup logs captured.[/yellow] "
                    f"Log path: {startup_log_path}"
                )

            console.print(
                "[cyan]Tip:[/cyan] Run `bbannotate start --reload --no-browser` "
                "to see startup errors in the terminal."
            )
            raise typer.Exit(1)

        if startup_log_path.exists():
            with suppress(OSError):
                startup_log_path.unlink()

        console.print(
            f"[green]✓[/green] Server started in background (PID: {process.pid})"
        )

        browser_base_url = probe_url
        if not no_browser:
            browser_url = browser_base_url
            if browser_session_token:
                encoded = urllib.parse.quote(browser_session_token, safe="")
                browser_url = f"{browser_base_url}?bb_session={encoded}"
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
            args=(probe_url, probe_url),
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


@app.command()
def status(
    host: Annotated[
        str,
        typer.Option("--host", "-h", help="Host to check for backend status."),
    ] = "127.0.0.1",
    port: Annotated[
        int,
        typer.Option("--port", "-p", help="Backend port to check."),
    ] = 8000,
    frontend_port: Annotated[
        int,
        typer.Option("--frontend-port", help="Frontend dev server port to check."),
    ] = 5173,
) -> None:
    """Show current bbannotate runtime status."""
    from rich.table import Table

    backend_url = f"http://{host}:{port}"
    backend_port_open = _is_tcp_port_open(host, port)
    frontend_port_open = _is_tcp_port_open(host, frontend_port)
    backend_healthy = _check_api_health(backend_url)

    all_processes = _list_running_processes()
    backend_processes = _find_backend_processes(all_processes)
    frontend_processes = _find_frontend_processes(all_processes)

    table = Table(title="Bbannotate Status")
    table.add_column("Component", style="bold")
    table.add_column("State")
    table.add_column("Details")

    backend_state = (
        "running"
        if backend_port_open or backend_healthy or backend_processes
        else "stopped"
    )
    backend_details = (
        f"port {port}: {'open' if backend_port_open else 'closed'}, "
        f"health: {'ok' if backend_healthy else 'unreachable'}, "
        f"processes: {len(backend_processes)}"
    )
    table.add_row("Backend API", backend_state, backend_details)

    frontend_state = (
        "running" if frontend_port_open or frontend_processes else "stopped"
    )
    frontend_details = (
        f"port {frontend_port}: {'open' if frontend_port_open else 'closed'}, "
        f"processes: {len(frontend_processes)}"
    )
    table.add_row("Frontend Dev", frontend_state, frontend_details)
    console.print(table)

    if backend_processes or frontend_processes:
        process_table = Table(title="Detected Processes")
        process_table.add_column("PID", style="cyan", justify="right")
        process_table.add_column("Type")
        process_table.add_column("Command")

        for pid, command in backend_processes:
            process_table.add_row(str(pid), "backend", command)
        for pid, command in frontend_processes:
            process_table.add_row(str(pid), "frontend", command)
        console.print(process_table)


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
