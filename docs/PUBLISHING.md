# Publishing Bbannotate to PyPI - Complete Guide

This guide walks you through everything needed to publish `bbannotate` as a professional Python package on PyPI.

---

## Table of Contents

1. [Pre-Publication Checklist](#1-pre-publication-checklist)
2. [Account Setup](#2-account-setup)
3. [Building the Package](#3-building-the-package)
4. [Testing with TestPyPI](#4-testing-with-testpypi)
5. [Publishing to PyPI](#5-publishing-to-pypi)
6. [Automated Publishing with GitHub Actions](#6-automated-publishing-with-github-actions)
7. [Version Management](#7-version-management)
8. [Post-Publication Tasks](#8-post-publication-tasks)

---

## 1. Pre-Publication Checklist

Before publishing, ensure everything is in order:

### ✅ Already Complete

- [x] `pyproject.toml` with proper metadata
- [x] `LICENSE` file (MIT)
- [x] `README.md` with badges, installation, usage
- [x] `CHANGELOG.md` for version history
- [x] `MANIFEST.in` for including non-Python files
- [x] `src/py.typed` marker for typed package
- [x] CLI entry point (`bbannotate` command)
- [x] Test suite (172 tests passing)
- [x] Type hints throughout codebase
- [x] Linting passing (ruff)

### 📋 Remaining Tasks

- [x] **Update repository URLs** in `pyproject.toml` ✓
- [x] **Choose final package name** - `bbannotate` is available on PyPI ✓
- [x] **Create PyPI and TestPyPI accounts** ✓
- [x] **Set up API tokens** ✓
- [x] **Test installation in a clean environment** ✓

### 🎉 Published!

**bbannotate v1.0.0** is live on PyPI: https://pypi.org/project/bbannotate/

---

## 2. Account Setup

### 2.1 Create PyPI Account

1. Go to https://pypi.org/account/register/
2. Create an account with a strong password
3. **Enable 2FA** (required for new projects as of 2024)
4. Verify your email address

### 2.2 Create TestPyPI Account

1. Go to https://test.pypi.org/account/register/
2. Create a separate account (TestPyPI is independent from PyPI)
3. Enable 2FA and verify email

### 2.3 Create API Tokens

API tokens are more secure than passwords and required for uploads.

#### For TestPyPI:
1. Go to https://test.pypi.org/manage/account/token/
2. Click "Add API token"
3. Name: `bbannotate-upload`
4. Scope: "Entire account" (for first upload) or project-specific after
5. **Copy the token immediately** - it won't be shown again

#### For PyPI:
1. Go to https://pypi.org/manage/account/token/
2. Follow the same process
3. Save the token securely

### 2.4 Configure Local Credentials

Create or edit `~/.pypirc`:

```ini
[distutils]
index-servers =
    pypi
    testpypi

[pypi]
username = __token__
password = pypi-YOUR_PYPI_TOKEN_HERE

[testpypi]
repository = https://test.pypi.org/legacy/
username = __token__
password = pypi-YOUR_TESTPYPI_TOKEN_HERE
```

**Security Note**: Set proper permissions:
```bash
chmod 600 ~/.pypirc
```

---

## 3. Building the Package

### 3.1 Install Build Tools

```bash
# Activate your virtual environment
source .venv/bin/activate

# Install build and twine
pip install build twine
```

### 3.2 Build the Frontend First

The package should include pre-built frontend assets:

```bash
# Install frontend dependencies
cd frontend
npm install

# Build production assets
npm run build

# Verify dist folder exists
ls -la dist/
cd ..
```

### 3.3 Build Python Package

```bash
# Clean any previous builds
rm -rf dist/ build/

# Build the wheel directly (includes frontend assets)
hatchling build -t wheel

# This creates:
# - dist/bbannotate-1.0.0-py3-none-any.whl (wheel with bundled frontend)
```

Or build both sdist and wheel:
```bash
pip install build
python -m build
```

### 3.4 Verify the Build

```bash
# Check the contents of the wheel - should include src/frontend_dist/
unzip -l dist/bbannotate-1.0.0-py3-none-any.whl

# You should see:
# - src/frontend_dist/index.html
# - src/frontend_dist/assets/index-*.js
# - src/frontend_dist/assets/index-*.css

# Validate with twine
pip install twine
twine check dist/*
```

Expected output from `twine check`:
```
Checking dist/bbannotate-1.0.0-py3-none-any.whl: PASSED
```

---

## 4. Testing with TestPyPI

**Always test on TestPyPI first!** This catches issues before they affect the real PyPI.

### 4.1 Upload to TestPyPI

```bash
twine upload --repository testpypi dist/*
```

Or use the Makefile:
```bash
make publish-test
```

### 4.2 Test Installation from TestPyPI

Create a fresh virtual environment to test:

```bash
# Create a temporary test environment
python3.12 -m venv /tmp/test-bbannotate
source /tmp/test-bbannotate/bin/activate

# Install from TestPyPI
# Note: --extra-index-url is needed because TestPyPI may not have all dependencies
pip install --index-url https://test.pypi.org/simple/ \
    --extra-index-url https://pypi.org/simple/ \
    bbannotate

# Verify installation
bbannotate --version
bbannotate info

# Test the start command (Ctrl+C to stop)
bbannotate start --no-browser

# Clean up
deactivate
rm -rf /tmp/test-bbannotate
```

### 4.3 Common TestPyPI Issues

| Issue | Solution |
|-------|----------|
| "File already exists" | Bump version number (can't overwrite) |
| Missing dependencies | Use `--extra-index-url https://pypi.org/simple/` |
| Invalid classifier | Check classifiers against PyPI's list |
| README not rendering | Ensure README.md is valid Markdown |

---

## 5. Publishing to PyPI

Once TestPyPI testing passes, publish to the real PyPI.

### 5.1 Final Checks

```bash
# Run all tests one more time
make test

# Run linting
make check-all

# Verify version in __init__.py matches CHANGELOG
grep __version__ src/__init__.py
```

### 5.2 Upload to PyPI

```bash
twine upload dist/*
```

Or use the Makefile:
```bash
make publish
```

### 5.3 Verify on PyPI

1. Go to https://pypi.org/project/bbannotate/
2. Check that:
   - README renders correctly
   - All metadata appears
   - Version is correct
   - Download links work

### 5.4 Test Installation from PyPI

```bash
# Create fresh environment
python3.12 -m venv /tmp/test-pypi
source /tmp/test-pypi/bin/activate

# Install from PyPI
pip install bbannotate

# Verify
bbannotate --version
bbannotate start --no-browser
# Ctrl+C to stop

deactivate
rm -rf /tmp/test-pypi
```

---

## 6. Automated Publishing with GitHub Actions

Set up CI/CD to automatically publish on new releases.

### 6.1 Create GitHub Actions Workflow

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to PyPI

on:
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Build frontend
        run: |
          cd frontend
          npm ci
          npm run build

      - name: Install build dependencies
        run: pip install build

      - name: Build package
        run: python -m build

      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          password: ${{ secrets.PYPI_API_TOKEN }}

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install dependencies
        run: pip install -e ".[dev]"

      - name: Run tests
        run: pytest tests/ -v

      - name: Run linting
        run: ruff check src/ tests/
```

### 6.2 Create CI Workflow for PRs

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        python-version: ["3.12", "3.13"]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python ${{ matrix.python-version }}
        uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}

      - name: Install dependencies
        run: pip install -e ".[dev]"

      - name: Run tests
        run: pytest tests/ -v --cov=src --cov-report=xml

      - name: Run linting
        run: ruff check src/ tests/

      - name: Run type checking
        run: pyright src/

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Build frontend
        run: |
          cd frontend
          npm ci
          npm run build

      - name: Build package
        run: |
          pip install build
          python -m build

      - name: Check package
        run: |
          pip install twine
          twine check dist/*
```

### 6.3 Add PyPI Token to GitHub Secrets

1. Go to your repository on GitHub
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `PYPI_API_TOKEN`
5. Value: Your PyPI API token (starts with `pypi-`)

---

## 7. Version Management

### 7.1 Semantic Versioning

Follow [SemVer](https://semver.org/):
- **MAJOR** (1.x.x → 2.0.0): Breaking changes
- **MINOR** (1.0.x → 1.1.0): New features, backward compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward compatible

### 7.2 Releasing a New Version

1. **Update version in `src/__init__.py`**:
   ```python
   __version__ = "1.1.0"
   ```

2. **Update CHANGELOG.md**:
   ```markdown
   ## [1.1.0] - 2026-02-15

   ### Added
   - New feature X

   ### Fixed
   - Bug Y
   ```

3. **Commit the changes**:
   ```bash
   git add src/__init__.py CHANGELOG.md
   git commit -m "Bump version to 1.1.0"
   git push origin main
   ```

4. **Create a Git tag**:
   ```bash
   git tag -a v1.1.0 -m "Release v1.1.0"
   git push origin v1.1.0
   ```

5. **Create GitHub Release**:
   - Go to Releases → Draft a new release
   - Choose tag: `v1.1.0`
   - Title: `v1.1.0`
   - Description: Copy from CHANGELOG
   - Click "Publish release"

6. **GitHub Actions will automatically publish to PyPI**

---

## 8. Post-Publication Tasks

### 8.1 Badge Updates

Your README already has badge placeholders. Once published, they'll work automatically:

```markdown
[![PyPI version](https://img.shields.io/pypi/v/bbannotate)](https://pypi.org/project/bbannotate/)
[![Python versions](https://img.shields.io/pypi/pyversions/bbannotate)](https://pypi.org/project/bbannotate/)
```

### 8.2 Documentation Site (Optional)

Consider setting up documentation with MkDocs or Sphinx:

```bash
pip install mkdocs mkdocs-material

# Create docs structure
mkdocs new .

# Edit mkdocs.yml and docs/
# Then deploy to GitHub Pages
mkdocs gh-deploy
```

### 8.3 Add to Package Indexes

- Submit to https://awesome-python.com/ if appropriate
- Create a blog post or announcement
- Share on social media / Reddit / HN

### 8.4 Monitor

- Watch for issues and bug reports
- Respond to user questions
- Set up Dependabot for dependency updates

---

## Quick Reference Commands

```bash
# Build package
make build

# Test upload to TestPyPI
make publish-test

# Upload to PyPI
make publish

# Run all checks before release
make check-all

# Create new version (manual)
# 1. Edit src/__init__.py
# 2. Edit CHANGELOG.md
# 3. git commit -m "Bump version to X.Y.Z"
# 4. git tag -a vX.Y.Z -m "Release vX.Y.Z"
# 5. git push origin main --tags
```

---

## Troubleshooting

### "Package name already taken"

Check availability:
```bash
pip index versions bbannotate
```
If taken, choose a different name and update `pyproject.toml`.

### "Invalid distribution file"

```bash
# Rebuild from scratch
rm -rf dist/ build/ *.egg-info
python -m build
twine check dist/*
```

### "README not rendering on PyPI"

- Ensure `readme = "README.md"` is in `pyproject.toml`
- Validate Markdown syntax
- Check for special characters or unsupported features

### "Module not found after install"

- Check `[tool.hatch.build.targets.wheel]` in `pyproject.toml`
- Ensure `packages = ["src"]` is correct
- Verify with `pip show -f bbannotate`

---

## Summary Checklist

```
Before First Publish:
□ Build frontend: cd frontend && npm install && npm run build
□ Create PyPI account with 2FA
□ Create TestPyPI account with 2FA
□ Generate API tokens for both
□ Configure ~/.pypirc

Publishing:
□ Update version in src/__init__.py
□ Update CHANGELOG.md
□ Run make check-all
□ Build: make build
□ Test on TestPyPI: make publish-test
□ Test install from TestPyPI
□ Publish to PyPI: make publish
□ Verify on pypi.org/project/bbannotate
□ Create GitHub release with tag

Post-Publish:
□ Set up GitHub Actions (optional but recommended)
□ Add PYPI_API_TOKEN secret to GitHub
□ Announce the release
```
