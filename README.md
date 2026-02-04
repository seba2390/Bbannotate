<p align="center">
  <img src="logo.png" alt="Bbannotate Logo" width="400">
</p>

# Bbannotate

Bounding box annotation tool for image datasets. React/TypeScript frontend, FastAPI backend, YOLO export.

## Setup

```bash
make install && make frontend-install
```

## Run

```bash
make run
```

Open http://localhost:5173

## Shortcuts

| Key | Action |
|-----|--------|
| `D` | Draw mode |
| `V` | Select mode |
| `←` `→` | Navigate images |
| `Del` | Delete annotation |
| `Esc` | Deselect |

## Export

- **YOLO**: `POST /api/export/yolo` — ZIP with train/val split
- **COCO**: `POST /api/export/coco` — COCO JSON format

## Commands

| Command | Description |
|---------|-------------|
| `make run` | Start application |
| `make test` | Run tests |
| `make test-cov` | Tests with coverage |
| `make check-all` | Lint + type check + test |
| `make clean` | Remove build artifacts |

## Structure

```
src/           # FastAPI backend
frontend/      # React frontend
data/          # Images + annotations (runtime)
tests/         # 118 tests, 95% coverage
```

## License

MIT
