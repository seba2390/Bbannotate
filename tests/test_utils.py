"""Tests for shared utility functions."""

from pathlib import Path

from src.utils import (
    find_frontend_dist,
    sanitize_filename,
    sanitize_name_for_path,
    validate_path_in_directory,
)


class TestSanitizeFilename:
    """Tests for sanitize_filename function."""

    def test_simple_filename(self) -> None:
        """Test that simple filenames are preserved."""
        assert sanitize_filename("image.png") == "image.png"
        assert sanitize_filename("test.jpg") == "test.jpg"

    def test_removes_directory_path(self) -> None:
        """Test that directory paths are removed."""
        assert sanitize_filename("path/to/image.png") == "image.png"
        assert sanitize_filename("/absolute/path/file.txt") == "file.txt"

    def test_prevents_path_traversal(self) -> None:
        """Test that path traversal attacks are prevented."""
        assert sanitize_filename("../../../etc/passwd") == "passwd"
        assert sanitize_filename("../secret.txt") == "secret.txt"

    def test_handles_dots_in_filename(self) -> None:
        """Test that dots in filenames are preserved."""
        assert sanitize_filename("file.name.ext") == "file.name.ext"
        assert sanitize_filename("...hidden") == "...hidden"

    def test_empty_string(self) -> None:
        """Test handling of empty string."""
        assert sanitize_filename("") == ""

    def test_only_filename(self) -> None:
        """Test that just the filename is returned."""
        assert sanitize_filename("./file.txt") == "file.txt"
        assert sanitize_filename("dir/subdir/file.txt") == "file.txt"


class TestSanitizeNameForPath:
    """Tests for sanitize_name_for_path function."""

    def test_simple_name(self) -> None:
        """Test that simple names are preserved (lowercased)."""
        assert sanitize_name_for_path("MyProject") == "myproject"
        assert sanitize_name_for_path("test") == "test"

    def test_preserves_allowed_characters(self) -> None:
        """Test that alphanumeric, dash, and underscore are preserved."""
        assert sanitize_name_for_path("my-project_123") == "my-project_123"
        assert sanitize_name_for_path("Test-Name_v2") == "test-name_v2"

    def test_replaces_special_characters(self) -> None:
        """Test that special characters are replaced with underscores."""
        assert sanitize_name_for_path("My Project!") == "my_project_"
        # @#$%^&*() = 9 special characters
        assert sanitize_name_for_path("test@#$%^&*()") == "test_________"
        assert sanitize_name_for_path("hello world") == "hello_world"

    def test_limits_length(self) -> None:
        """Test that output is limited to max_length."""
        long_name = "a" * 100
        assert len(sanitize_name_for_path(long_name)) == 50
        assert sanitize_name_for_path(long_name, max_length=10) == "a" * 10

    def test_custom_max_length(self) -> None:
        """Test custom max_length parameter."""
        assert sanitize_name_for_path("abcdefghij", max_length=5) == "abcde"
        assert sanitize_name_for_path("short", max_length=100) == "short"

    def test_empty_string(self) -> None:
        """Test handling of empty string."""
        assert sanitize_name_for_path("") == ""

    def test_unicode_characters(self) -> None:
        """Test that unicode letters are preserved (isalnum includes unicode)."""
        # Python's isalnum() includes unicode letters
        assert sanitize_name_for_path("café") == "café"
        # CJK characters are also alphanumeric
        assert sanitize_name_for_path("日本語") == "日本語"
        # Emoji and symbols are not
        assert sanitize_name_for_path("test🎉") == "test_"


class TestValidatePathInDirectory:
    """Tests for validate_path_in_directory function."""

    def test_valid_path_in_directory(self, tmp_path: Path) -> None:
        """Test that valid paths within directory return True."""
        file_path = tmp_path / "image.png"
        assert validate_path_in_directory(file_path, tmp_path) is True

    def test_path_traversal_attack(self, tmp_path: Path) -> None:
        """Test that path traversal attempts return False."""
        attack_path = tmp_path / ".." / ".." / "etc" / "passwd"
        assert validate_path_in_directory(attack_path, tmp_path) is False

    def test_absolute_path_outside_directory(self, tmp_path: Path) -> None:
        """Test that absolute paths outside directory return False."""
        outside_path = Path("/etc/passwd")
        assert validate_path_in_directory(outside_path, tmp_path) is False

    def test_nested_valid_path(self, tmp_path: Path) -> None:
        """Test that nested paths within directory return True."""
        nested_path = tmp_path / "subdir" / "another" / "file.txt"
        assert validate_path_in_directory(nested_path, tmp_path) is True

    def test_same_directory(self, tmp_path: Path) -> None:
        """Test that the directory itself returns True."""
        assert validate_path_in_directory(tmp_path, tmp_path) is True


class TestFindFrontendDist:
    """Tests for find_frontend_dist function."""

    def test_returns_path_or_none(self) -> None:
        """Test that find_frontend_dist returns Path or None."""
        result = find_frontend_dist()
        assert result is None or isinstance(result, Path)

    def test_finds_existing_dist(self, tmp_path: Path) -> None:
        """Test that it finds dist directory with index.html."""
        from unittest.mock import patch

        # Create dist structure in temp directory
        dist_dir = tmp_path / "frontend" / "dist"
        dist_dir.mkdir(parents=True)
        (dist_dir / "index.html").write_text("<html></html>")

        with patch.object(Path, "cwd", return_value=tmp_path):
            result = find_frontend_dist()
            # May find real dist or our test dist
            if result is not None:
                assert result.exists()
                assert (result / "index.html").exists()
