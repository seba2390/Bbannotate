# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-02-04

### Fixed

- Fixed logo image URL in README to use absolute path for PyPI display
- Fixed badge URLs to use correct GitHub repository

## [1.0.0] - 2026-02-04

### Added

- Initial release as a Python package
- CLI interface with `bbannotate start` command
- FastAPI backend for annotation management
- React/TypeScript frontend for bounding box annotation
- Support for multiple image formats (PNG, JPEG, WebP, BMP)
- Project management system for organizing annotation work
- Export formats:
  - YOLO (with train/val/test split)
  - COCO JSON
  - Pascal VOC XML
  - Apple CreateML JSON
  - CSV
- Configurable data and project directories via CLI flags or environment variables
- Comprehensive test suite with 145 tests
- Full type hints with pyright validation

### Configuration

- `--host` / `-h`: Server host (default: 127.0.0.1)
- `--port` / `-p`: Server port (default: 8000)
- `--no-browser`: Don't open browser automatically
- `--reload` / `-r`: Enable auto-reload for development
- `--data-dir` / `-d`: Custom data directory
- `--projects-dir`: Custom projects directory

### Environment Variables

- `BBANNOTATE_DATA_DIR`: Override default data directory
- `BBANNOTATE_PROJECTS_DIR`: Override default projects directory

[Unreleased]: https://github.com/sebastianydemadsen/bbannotate/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sebastianydemadsen/bbannotate/releases/tag/v1.0.0
