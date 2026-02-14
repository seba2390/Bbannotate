# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-02-14

### Changed

- Centered the canvas on the selected bounding box when selected from the right annotation panel, while preserving current zoom

## [1.1.0] - 2026-02-14

### Changed

- Stabilized select-mode interactions so bounding boxes are selected reliably on pointer down and drag start
- Kept bounding box edge thickness consistent when selected to preserve exact edge visibility
- Improved resize handle usability with clearer transformer handles and constrained in-image resizing behavior
- Reduced select-mode resize handle marker circle size slightly for cleaner visuals

### Fixed

- Fixed top resize handles becoming intermittently non-interactive due label text intercepting pointer events
- Fixed intermittent transformer attachment by selecting nodes via ID predicate lookup instead of selector-string lookup
- Fixed inconsistent resize-anchor activation by resolving handle selection from pointer distance rather than shape hit-order

## [1.0.9] - 2026-02-11

### Added

- Adjustable draw crosshair controls in canvas toolbar (arm length and stroke width)
- Persistent crosshair preferences via localStorage

### Changed

- Refined the canvas top toolbar into compact titled groups (`Controls`, `Zoom`, `Label`, `Box`, `Cursor`) with consistent control heights
- Updated `Controls` to always-visible compact tool buttons (`Select`, `Draw`, `Pan`) under the title
- Moved zoom actions into a compact expandable panel under `Zoom` to reduce toolbar width
- Replaced always-visible cursor sliders with compact expandable controls for arm length and arm width to keep toolbar footprint smaller
- Increased maximum crosshair arm length from `48` to `96` for longer cursor arms
- Switched draw-mode crosshair rendering to a canvas overlay to keep long cursor arms stable at larger sizes
- Lowered minimum crosshair arm width from `1.0` to `0.5` for finer cursor thickness tuning

### Fixed

- Prevent drawing from starting outside image bounds
- Constrain in-progress drawing to image boundaries (including auto-pan updates), so boxes cannot be dragged past image edges
- Fixed crosshair shrinking at larger arm lengths due browser cursor image-size limits
- Center images by default in the canvas viewport (including zoom reset)

## [1.0.6] - 2026-02-07

### Added

- Multi-select image deletion: checkbox mode for selecting multiple images and bulk deleting them
- Enter key shortcut to mark current image as done (toggles done status)
- Enter shortcut displayed in status bar
- Select all checkbox in image list header

### Changed

- Export format selection: replaced radio button list with compact dropdown menu
- Redesigned YOLO export: interactive slider showing all feasible train/val splits based on done image count
- YOLO export now only exports images marked as "done" (previously exported all images)
- Removed test split from YOLO export (now train/val only with default 80/20)
- Added shuffle and seed support for YOLO export dataset randomization
- Modern styled checkboxes with custom design replacing native browser checkboxes

### Fixed

- Fixed YOLO export showing 0 annotated images: ExportDialog now fetches count directly on open
- Fixed done status not persisting when reopening a project (get_all_done_status now returns status for all images)
- Fixed train/val split slider: tick marks now vertically centered on track, reduced slider handle size for better proportions
- Fixed bounding box not being saved when user draws before defining labels: pending annotation is now saved with the first label after labels are created

## [1.0.5] - 2026-02-05

### Added

- Undo functionality (`⌘Z` / `Ctrl+Z`) to undo the last drawn bounding box
- Image count display in sidebar title (matches Labels and Annotations count display)
- Project-scoped labels: each project now maintains its own independent set of labels

### Changed

- Improved edge pan behavior: threshold reduced from 50px to 15px (triggers only at actual edge)
- Smoother pan speed: reduced from 15px/frame to 4px/frame for better control
- Delta-proportional zoom for trackpad pinch-to-zoom (much smoother control)
- Increased upload rate limit from 30/minute to 1000/minute for bulk image imports
- Improved status bar styling with grouped shortcuts and better spacing
- Added `BBANNOTATE_UPLOAD_RATE_LIMIT` environment variable documentation to README

### Fixed

- Fixed premature bounding box release when dragging near canvas edge (removed onMouseLeave handler, uses window-level mouseup instead)
- Fixed labels being shared across projects (now stored per-project in localStorage)

## [1.0.4] - 2026-02-05

### Fixed

- Fixed broken image display in main view and thumbnails (browser <img> tags now use project_id query parameter)

### Changed

- Restructured toolbar layout: Export button on right, navigation buttons centered
- Moved Done button to upper right corner of image view for better visibility
- Integrated label dropdown into canvas toolbar alongside zoom controls
- Moved labels configurer to right panel
- Moved Clear button to annotations section in right panel
- Removed default labels; users are now prompted to create their first label when drawing

## [1.0.3] - 2026-02-05

### Fixed

- Wait for server to be ready before opening browser (prevents ERR_CONNECTION_REFUSED)
- Fixed Windows test timing issue for project ordering
- Fixed Makefile to build frontend before Python install

## [1.0.2] - 2026-02-05

### Fixed

- Fixed CI workflow to build wheel directly (avoiding sdist which excludes frontend/dist)
- Fixed CLI help test to handle Rich ANSI color codes in output
- Fixed .gitignore to properly track `frontend/src/lib/api.ts`

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

[Unreleased]: https://github.com/sebastianydemadsen/bbannotate/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/sebastianydemadsen/bbannotate/releases/tag/v1.1.1
[1.1.0]: https://github.com/sebastianydemadsen/bbannotate/releases/tag/v1.1.0
[1.0.9]: https://github.com/sebastianydemadsen/bbannotate/releases/tag/v1.0.9
[1.0.0]: https://github.com/sebastianydemadsen/bbannotate/releases/tag/v1.0.0
