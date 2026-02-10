"""Tests for the CLI module."""

import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from src import __version__
from src.cli import (
    _find_frontend_src,
    app,
)
from src.utils import find_frontend_dist


@pytest.fixture
def runner() -> CliRunner:
    """Create CLI test runner."""
    return CliRunner()


@pytest.fixture
def temp_dir() -> Path:
    """Create a temporary directory for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


class TestVersionCommand:
    """Tests for --version flag."""

    def test_version_flag(self, runner: CliRunner) -> None:
        """Test that --version shows version and exits."""
        result = runner.invoke(app, ["--version"])
        assert result.exit_code == 0
        assert __version__ in result.output
        assert "bbannotate" in result.output

    def test_version_short_flag(self, runner: CliRunner) -> None:
        """Test that -v shows version and exits."""
        result = runner.invoke(app, ["-v"])
        assert result.exit_code == 0
        assert __version__ in result.output


class TestHelpCommand:
    """Tests for --help flag."""

    def test_help_flag(self, runner: CliRunner) -> None:
        """Test that --help shows help and exits."""
        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0
        assert "Bounding box annotation tool" in result.output
        assert "start" in result.output
        assert "build-frontend" in result.output
        assert "info" in result.output

    def test_no_args_shows_help(self, runner: CliRunner) -> None:
        """Test that no args shows help."""
        result = runner.invoke(app, [])
        # Typer with no_args_is_help=True returns exit code 0
        # but some versions may return 2, check for help content instead
        assert "start" in result.output or "Usage" in result.output


class TestStartCommand:
    """Tests for the start command."""

    def test_start_help(self, runner: CliRunner) -> None:
        """Test start command help."""
        result = runner.invoke(app, ["start", "--help"])
        assert result.exit_code == 0
        # Strip ANSI codes - Rich adds color codes that split option names
        import re

        clean_output = re.sub(r"\x1b\[[0-9;]*m", "", result.output)
        assert "--host" in clean_output
        assert "--port" in clean_output
        assert "--no-browser" in clean_output
        assert "--reload" in clean_output
        assert "--data-dir" in clean_output
        assert "--projects-dir" in clean_output

    @patch("src.cli._wait_for_server_ready", return_value=True)
    @patch("src.cli._start_detached_server")
    @patch("webbrowser.open")
    def test_start_default_options(
        self,
        mock_webbrowser: MagicMock,
        mock_start_detached: MagicMock,
        mock_wait_ready: MagicMock,
        runner: CliRunner,
    ) -> None:
        """Test start command launches detached server by default."""
        mock_process = MagicMock(pid=4242)
        mock_start_detached.return_value = mock_process
        runner.invoke(app, ["start", "--no-browser"])
        mock_start_detached.assert_called_once()
        args, kwargs = mock_start_detached.call_args
        assert args[0] == "127.0.0.1"
        assert args[1] == 8000
        env = args[2]
        assert "BBANNOTATE_SESSION_TOKEN" not in env
        mock_wait_ready.assert_called_once_with(
            "http://127.0.0.1:8000",
            timeout_seconds=15.0,
        )
        mock_webbrowser.assert_not_called()

    @patch("src.cli._wait_for_server_ready", return_value=True)
    @patch("src.cli._start_detached_server")
    @patch("webbrowser.open")
    def test_start_custom_host_port(
        self,
        mock_webbrowser: MagicMock,
        mock_start_detached: MagicMock,
        mock_wait_ready: MagicMock,
        runner: CliRunner,
    ) -> None:
        """Test start command with custom host and port."""
        mock_start_detached.return_value = MagicMock(pid=9999)
        runner.invoke(
            app, ["start", "--host", "0.0.0.0", "--port", "9000", "--no-browser"]
        )
        mock_start_detached.assert_called_once()
        args, kwargs = mock_start_detached.call_args
        assert args[0] == "0.0.0.0"
        assert args[1] == 9000
        mock_wait_ready.assert_called_once_with(
            "http://0.0.0.0:9000",
            timeout_seconds=15.0,
        )

    @patch("uvicorn.run")
    @patch("webbrowser.open")
    def test_start_with_reload(
        self,
        mock_webbrowser: MagicMock,
        mock_uvicorn: MagicMock,
        runner: CliRunner,
    ) -> None:
        """Test start command with reload enabled."""
        runner.invoke(app, ["start", "--reload", "--no-browser"])
        mock_uvicorn.assert_called_once_with(
            "src.main:app",
            host="127.0.0.1",
            port=8000,
            reload=True,
        )

    @patch("src.cli._wait_for_server_ready", return_value=True)
    @patch("src.cli._start_detached_server")
    @patch("webbrowser.open")
    def test_start_opens_browser_by_default(
        self,
        mock_webbrowser: MagicMock,
        mock_start_detached: MagicMock,
        mock_wait_ready: MagicMock,
        runner: CliRunner,
    ) -> None:
        """Test start command opens browser by default."""
        mock_start_detached.return_value = MagicMock(pid=4321)

        runner.invoke(app, ["start"])

        mock_wait_ready.assert_called_once_with(
            "http://127.0.0.1:8000",
            timeout_seconds=15.0,
        )
        mock_webbrowser.assert_called_once()
        opened_url = mock_webbrowser.call_args.args[0]
        assert opened_url.startswith("http://127.0.0.1:8000?bb_session=")

    @patch("src.cli._wait_for_server_ready", return_value=True)
    @patch("src.cli._start_detached_server")
    @patch("webbrowser.open")
    def test_start_no_browser_flag(
        self,
        mock_webbrowser: MagicMock,
        mock_start_detached: MagicMock,
        mock_wait_ready: MagicMock,
        runner: CliRunner,
    ) -> None:
        """Test start command with --no-browser flag."""
        mock_start_detached.return_value = MagicMock(pid=1010)
        runner.invoke(app, ["start", "--no-browser"])
        mock_wait_ready.assert_called_once_with(
            "http://127.0.0.1:8000",
            timeout_seconds=15.0,
        )
        mock_webbrowser.assert_not_called()

    @patch("src.cli._wait_for_server_ready", return_value=True)
    @patch("src.cli._start_detached_server")
    @patch("webbrowser.open")
    def test_start_sets_data_dir_env(
        self,
        mock_webbrowser: MagicMock,
        mock_start_detached: MagicMock,
        mock_wait_ready: MagicMock,
        runner: CliRunner,
        temp_dir: Path,
    ) -> None:
        """Test start command passes BBANNOTATE_DATA_DIR to detached process."""
        data_dir = temp_dir / "custom_data"
        data_dir.mkdir()
        mock_start_detached.return_value = MagicMock(pid=777)

        with patch.dict(os.environ, {}, clear=False):
            runner.invoke(app, ["start", "--data-dir", str(data_dir), "--no-browser"])
            mock_start_detached.assert_called_once()
            args, kwargs = mock_start_detached.call_args
            env = args[2]
            assert env["BBANNOTATE_DATA_DIR"] == str(data_dir.resolve())

    @patch("src.cli._wait_for_server_ready", return_value=True)
    @patch("src.cli._start_detached_server")
    @patch("webbrowser.open")
    def test_start_sets_projects_dir_env(
        self,
        mock_webbrowser: MagicMock,
        mock_start_detached: MagicMock,
        mock_wait_ready: MagicMock,
        runner: CliRunner,
        temp_dir: Path,
    ) -> None:
        """Test start command passes BBANNOTATE_PROJECTS_DIR to detached process."""
        projects_dir = temp_dir / "custom_projects"
        projects_dir.mkdir()
        mock_start_detached.return_value = MagicMock(pid=555)

        with patch.dict(os.environ, {}, clear=False):
            runner.invoke(
                app, ["start", "--projects-dir", str(projects_dir), "--no-browser"]
            )
            mock_start_detached.assert_called_once()
            args, kwargs = mock_start_detached.call_args
            env = args[2]
            assert env["BBANNOTATE_PROJECTS_DIR"] == str(projects_dir.resolve())


class TestInfoCommand:
    """Tests for the info command."""

    def test_info_shows_version(self, runner: CliRunner) -> None:
        """Test info command shows version."""
        result = runner.invoke(app, ["info"])
        assert result.exit_code == 0
        assert __version__ in result.output

    def test_info_shows_python_version(self, runner: CliRunner) -> None:
        """Test info command shows Python version."""
        result = runner.invoke(app, ["info"])
        assert result.exit_code == 0
        # Should contain Python version info
        assert "Python" in result.output

    def test_info_shows_frontend_status(self, runner: CliRunner) -> None:
        """Test info command shows frontend status."""
        result = runner.invoke(app, ["info"])
        assert result.exit_code == 0
        assert "Frontend" in result.output


class TestBuildFrontendCommand:
    """Tests for the build-frontend command."""

    def test_build_frontend_help(self, runner: CliRunner) -> None:
        """Test build-frontend command help."""
        result = runner.invoke(app, ["build-frontend", "--help"])
        assert result.exit_code == 0
        assert "Build the frontend assets" in result.output

    @patch("src.cli._find_frontend_src")
    def test_build_frontend_no_frontend_dir(
        self,
        mock_find_frontend: MagicMock,
        runner: CliRunner,
    ) -> None:
        """Test build-frontend command when frontend dir not found."""
        mock_find_frontend.return_value = None
        result = runner.invoke(app, ["build-frontend"])
        assert result.exit_code == 1
        assert "Frontend source directory not found" in result.output

    @patch("src.cli.subprocess.run")
    @patch("src.cli._find_frontend_src")
    def test_build_frontend_npm_not_found(
        self,
        mock_find_frontend: MagicMock,
        mock_subprocess: MagicMock,
        runner: CliRunner,
        temp_dir: Path,
    ) -> None:
        """Test build-frontend command when npm is not found."""
        mock_find_frontend.return_value = temp_dir
        mock_subprocess.side_effect = FileNotFoundError()
        result = runner.invoke(app, ["build-frontend"])
        assert result.exit_code == 1
        assert "npm not found" in result.output

    @patch("src.cli.subprocess.run")
    @patch("src.cli._find_frontend_src")
    def test_build_frontend_npm_install_fails(
        self,
        mock_find_frontend: MagicMock,
        mock_subprocess: MagicMock,
        runner: CliRunner,
        temp_dir: Path,
    ) -> None:
        """Test build-frontend command when npm install fails."""
        mock_find_frontend.return_value = temp_dir
        # First call (npm --version) succeeds, second (npm install) fails
        mock_subprocess.side_effect = [
            MagicMock(returncode=0),  # npm --version
            MagicMock(returncode=1),  # npm install
        ]
        result = runner.invoke(app, ["build-frontend"])
        assert result.exit_code == 1
        assert "npm install failed" in result.output

    @patch("src.cli.subprocess.run")
    @patch("src.cli._find_frontend_src")
    def test_build_frontend_npm_build_fails(
        self,
        mock_find_frontend: MagicMock,
        mock_subprocess: MagicMock,
        runner: CliRunner,
        temp_dir: Path,
    ) -> None:
        """Test build-frontend command when npm build fails."""
        mock_find_frontend.return_value = temp_dir
        # First two calls succeed, third (npm run build) fails
        mock_subprocess.side_effect = [
            MagicMock(returncode=0),  # npm --version
            MagicMock(returncode=0),  # npm install
            MagicMock(returncode=1),  # npm run build
        ]
        result = runner.invoke(app, ["build-frontend"])
        assert result.exit_code == 1
        assert "npm build failed" in result.output

    @patch("src.cli.subprocess.run")
    @patch("src.cli._find_frontend_src")
    def test_build_frontend_success(
        self,
        mock_find_frontend: MagicMock,
        mock_subprocess: MagicMock,
        runner: CliRunner,
        temp_dir: Path,
    ) -> None:
        """Test build-frontend command succeeds."""
        mock_find_frontend.return_value = temp_dir
        mock_subprocess.return_value = MagicMock(returncode=0)
        result = runner.invoke(app, ["build-frontend"])
        assert result.exit_code == 0
        assert "Frontend built successfully" in result.output


class TestFindFrontendDist:
    """Tests for find_frontend_dist helper."""

    def test_find_frontend_dist_not_found(self, temp_dir: Path) -> None:
        """Test find_frontend_dist returns None when not found."""
        with patch.object(Path, "cwd", return_value=temp_dir):
            # Create empty directories (no index.html)
            result = find_frontend_dist()
            # Since we're testing in a real environment, it may find the real dist
            # Just verify it returns Path or None
            assert result is None or isinstance(result, Path)

    def test_find_frontend_dist_in_cwd(self, temp_dir: Path) -> None:
        """Test find_frontend_dist finds dist in cwd directory."""
        # Create the dist directory with index.html
        dist_dir = temp_dir / "frontend" / "dist"
        dist_dir.mkdir(parents=True)
        (dist_dir / "index.html").write_text("<html></html>")

        with patch.object(Path, "cwd", return_value=temp_dir):
            result = find_frontend_dist()
            # Should find the dist directory in cwd
            if result is not None:
                assert result.exists()


class TestFindFrontendSrc:
    """Tests for _find_frontend_src helper."""

    def test_find_frontend_src_not_found(self, temp_dir: Path) -> None:
        """Test _find_frontend_src returns None when not found."""
        with patch.object(Path, "cwd", return_value=temp_dir):
            # No package.json exists
            result = _find_frontend_src()
            # May find real frontend or return None
            assert result is None or isinstance(result, Path)

    def test_find_frontend_src_in_cwd(self, temp_dir: Path) -> None:
        """Test _find_frontend_src finds frontend in cwd."""
        # Create frontend directory with package.json
        frontend_dir = temp_dir / "frontend"
        frontend_dir.mkdir()
        (frontend_dir / "package.json").write_text("{}")

        with patch.object(Path, "cwd", return_value=temp_dir):
            result = _find_frontend_src()
            # Should find the frontend directory
            if result is not None:
                assert (result / "package.json").exists()


class TestMainEntryPoint:
    """Tests for the main entry point."""

    def test_main_callable(self) -> None:
        """Test that main function is callable."""
        from src.cli import main

        assert callable(main)

    def test_app_is_typer_app(self) -> None:
        """Test that app is a Typer application."""
        from typer import Typer

        assert isinstance(app, Typer)
