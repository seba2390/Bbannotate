"""Shared utility functions for the annotation tool."""

from pathlib import Path


def sanitize_filename(filename: str) -> str:
    """Sanitize a filename to prevent path traversal attacks.

    Extracts just the filename component, removing any directory paths
    that could be used for path traversal (e.g., "../", "/etc/").

    Args:
        filename: The raw filename that may contain path components.

    Returns:
        The sanitized filename with only the base name component.

    Example:
        >>> sanitize_filename("../../../etc/passwd")
        'passwd'
        >>> sanitize_filename("image.png")
        'image.png'
    """
    return Path(filename).name


def sanitize_name_for_path(name: str, max_length: int = 50) -> str:
    """Sanitize a name for use in filesystem paths.

    Replaces special characters with underscores and limits length.
    Useful for creating safe directory names from user-provided names.

    Args:
        name: The name to sanitize (e.g., project name).
        max_length: Maximum length of the sanitized name.

    Returns:
        A sanitized string safe for use in file paths.

    Example:
        >>> sanitize_name_for_path("My Project! @#$%")
        'my_project______'
        >>> sanitize_name_for_path("a" * 100, max_length=10)
        'aaaaaaaaaa'
    """
    sanitized = "".join(c if c.isalnum() or c in "-_" else "_" for c in name.lower())
    return sanitized[:max_length]


def validate_path_in_directory(path: Path, directory: Path) -> bool:
    """Validate that a path is contained within the expected directory.

    Prevents path traversal attacks by ensuring resolved paths stay within
    their intended parent directory.

    Args:
        path: The path to validate.
        directory: The directory that should contain the path.

    Returns:
        True if the path is safely within the directory, False otherwise.

    Example:
        >>> base = Path("/data/images")
        >>> validate_path_in_directory(base / "photo.jpg", base)
        True
        >>> validate_path_in_directory(base / "../etc/passwd", base)
        False
    """
    try:
        resolved_path = path.resolve()
        resolved_dir = directory.resolve()
        return resolved_path.is_relative_to(resolved_dir)
    except (ValueError, OSError):
        return False


def find_frontend_dist() -> Path | None:
    """Find the frontend dist directory.

    Checks in order:
    1. Bundled with package (src/frontend_dist) - for pip install
    2. Relative to package (frontend/dist) - for development
    3. Current working directory (frontend/dist) - for development

    Returns:
        Path to the frontend dist directory, or None if not found.
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
