<p align="center">
  <img src="https://raw.githubusercontent.com/seba2390/Bbannotate/main/frontend/public/bbannotate_logo.png" alt="Bbannotate Logo" width="500">
</p>

<p align="center">
  <a href="https://pypi.org/project/bbannotate/"><img src="https://img.shields.io/pypi/v/bbannotate?color=blue" alt="PyPI version"></a>
  <a href="https://pypi.org/project/bbannotate/"><img src="https://img.shields.io/badge/python-3.12%2B-blue" alt="Python versions"></a>
  <a href="https://github.com/seba2390/Bbannotate/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
</p>

A lightweight bounding box annotation tool for image datasets. Built with React/TypeScript frontend and FastAPI backend. Export to YOLO, COCO, Pascal VOC, and more.

## Features

- 🖼️ **Multi-format support** — PNG, JPEG, WebP, BMP
- 📁 **Project management** — Organize annotations by project
- 🏷️ **Custom labels** — Define your own class labels
- 🎨 **Adaptive box colors** — Auto contrast, label-based, or custom color modes
- ⌨️ **Keyboard shortcuts** — Fast annotation workflow
- 📤 **Multiple export formats** — YOLO, COCO, Pascal VOC, CreateML, CSV
- 🔄 **Train/Val/Test split** — Automatic dataset splitting for YOLO export

## Installation

```bash
pip install bbannotate
```

### Requirements

- Python 3.12+
- Node.js (only for frontend development)

## Quick Start

```bash
# Start the annotation server
bbannotate start

# Opens http://127.0.0.1:8000 in your browser.
# By default the server runs detached, so you can close the terminal.
# Closing that browser session stops the detached server automatically.
```

### Runtime Modes

- **Default (`bbannotate start`)**: Starts server in detached mode and links lifecycle to the opened browser session.
- **Development (`bbannotate start --reload`)**: Runs in foreground with auto-reload.
- **No Browser (`bbannotate start --no-browser`)**: Starts server without opening browser automatically.

### CLI Options

```bash
bbannotate start [OPTIONS]

Options:
  -h, --host TEXT        Host to bind the server to [default: 127.0.0.1]
  -p, --port INTEGER     Port to bind the server to [default: 8000]
  --no-browser           Don't open browser automatically
  -r, --reload           Enable auto-reload for development
  -d, --data-dir PATH    Directory for storing data [default: ./data]
  --projects-dir PATH    Directory for storing projects [default: ./projects]
  --help                 Show help and exit
```

### Other Commands

```bash
bbannotate info             # Show installation info
bbannotate status           # Show runtime status (backend/frontend processes + ports)
bbannotate build-frontend   # Build frontend assets (development)
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `D` | Draw mode |
| `S` | Select mode |
| `Space` | Pan mode |
| `←` `→` | Navigate images |
| `1-9` | Select label by index |
| `Del` / `Backspace` | Delete annotation |
| `⌘Z` / `Ctrl+Z` | Undo last annotation |
| `Esc` | Deselect / Cancel |
| `Enter` | Mark image done |

## Export Formats

| Format | Description |
|--------|-------------|
| **YOLO** | ZIP with train/val/test split, `data.yaml`, normalized coordinates |
| **COCO** | COCO JSON format with categories, images, and annotations |
| **Pascal VOC** | XML files per image with absolute coordinates |
| **CreateML** | Apple CreateML JSON format |
| **CSV** | Simple CSV with image, label, and bbox columns |

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `BBANNOTATE_DATA_DIR` | Override default data directory |
| `BBANNOTATE_PROJECTS_DIR` | Override default projects directory |
| `BBANNOTATE_UPLOAD_RATE_LIMIT` | Upload rate limit (default: `1000/minute`) |

## Development

### Setup

```bash
git clone https://github.com/sebastianydemadsen/bbannotate.git
cd bbannotate
make install        # Install with dev dependencies
make frontend-install  # Install frontend dependencies
```

### Development Commands

| Command | Description |
|---------|-------------|
| `make run` | Start full application (backend + frontend) |
| `make backend-dev` | Start backend only with auto-reload |
| `make frontend-dev` | Start frontend dev server |
| `make stop` | Stop all servers |
| `make test` | Run tests |
| `make test-cov` | Run tests with coverage report |
| `make type-check` | Run pyright type checking |
| `make format` | Format code with ruff |
| `make check-all` | Run all checks (lint, type, test) |
| `make build` | Build package for distribution |
| `make clean` | Remove build artifacts |

### Project Structure

```
src/               # Python package (FastAPI backend)
  api/             # API routes
  models/          # Pydantic models
  services/        # Business logic
  cli.py           # CLI entry point
frontend/          # React/TypeScript frontend
  src/
    components/    # UI components
    hooks/         # React hooks
tests/             # Python test suite
```

## License

[MIT](LICENSE)
