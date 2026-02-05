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
