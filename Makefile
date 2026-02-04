.PHONY: clean install test dev frontend-install frontend-dev frontend-build stop

# Python configuration
PYTHON = python3.12
VENV = .venv
VENV_BIN = $(VENV)/bin
SRC_DIR = src/
TEST_DIR = tests/
FRONTEND_DIR = frontend/

# Clean up Python cache files, build artifacts, and Node modules
clean:
	@echo "Cleaning up..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name "*.pyo" -delete 2>/dev/null || true
	find . -type f -name "*.log" -delete 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	rm -rf $(VENV)
	rm -rf .ruff_cache
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -rf .coverage
	rm -rf $(FRONTEND_DIR)/node_modules
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(FRONTEND_DIR)/.vite
	rm -rf coverage
	rm -rf data
	rm -rf exports
	rm -f package-lock.json
	rm -f $(FRONTEND_DIR)/package-lock.json
	@echo "Clean complete!"

# Install dependencies (Python)
install:
	@echo "Installing dependencies..."
	@if [ -d "$(VENV)" ]; then \
		echo "Deleting existing virtual environment..."; \
		rm -rf $(VENV); \
		echo "Existing virtual environment deleted."; \
	fi
	@echo "Creating new virtual environment..."
	@$(PYTHON) -m venv $(VENV)
	@echo "New virtual environment created."
	@echo "Installing Python packages..."
	@$(VENV_BIN)/pip install -r requirements.txt
	@echo "Python packages installed."
	@echo "Installation complete!"

# Install frontend dependencies
frontend-install:
	@echo "Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && npm install
	@echo "Frontend installation complete!"

# Install all dependencies (backend + frontend)
install-all: install frontend-install

# Run frontend development server
frontend-dev:
	@echo "Starting frontend dev server..."
	cd $(FRONTEND_DIR) && npm run dev

# Build frontend for production
frontend-build:
	@echo "Building frontend..."
	cd $(FRONTEND_DIR) && npm run build
	@echo "Frontend build complete!"

# Run backend development server
backend-dev:
	@echo "Starting backend dev server..."
	$(VENV_BIN)/uvicorn src.main:app --reload --host 127.0.0.1 --port 8000

# Run both frontend and backend (use in separate terminals or with tmux)
dev:
	@echo "To run the full application:"
	@echo "  Terminal 1: make backend-dev"
	@echo "  Terminal 2: make frontend-dev"
	@echo "Then open http://localhost:5173"

# Run the full application (backend + frontend concurrently)
run:
	@echo "Starting application..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:5173"
	@echo "Press Ctrl+C to stop"
	$(VENV_BIN)/uvicorn src.main:app --host 127.0.0.1 --port 8000 & \
	(cd $(FRONTEND_DIR) && npm run dev) & \
	trap 'kill %1 %2 2>/dev/null' INT TERM; wait

# Stop all running servers (backend + frontend)
stop:
	@echo "Stopping all servers..."
	@-pkill -f "uvicorn src.main:app" 2>/dev/null || true
	@-pkill -f "vite" 2>/dev/null || true
	@-lsof -ti:8000 | xargs kill -9 2>/dev/null || true
	@-lsof -ti:5173 | xargs kill -9 2>/dev/null || true
	@echo "All servers stopped!"

# Type check Python code in src folder using pyright
type-check:
	@echo "Running type check with pyright..."
	$(VENV_BIN)/pyright $(SRC_DIR)

# Fix Python code in src folder using ruff
fix:
	@echo "Running ruff fix..."
	$(VENV_BIN)/ruff check --fix $(SRC_DIR)

# Format Python code in src folder using ruff
format:
	@echo "Running ruff format..."
	$(VENV_BIN)/ruff format $(SRC_DIR)

# Run tests with pytest
test:
	@echo "Running tests with pytest..."
	$(VENV_BIN)/pytest $(TEST_DIR) -v

# Run tests with coverage report
test-cov:
	@echo "Running tests with coverage..."
	$(VENV_BIN)/pytest $(TEST_DIR) --cov=$(SRC_DIR) --cov-report=html --cov-report=term -v
	@echo "Coverage report generated in coverage/"

# Frontend linting and type checking
frontend-lint:
	@echo "Running frontend linting..."
	cd $(FRONTEND_DIR) && npm run lint

frontend-lint-fix:
	@echo "Fixing frontend lint issues..."
	cd $(FRONTEND_DIR) && npm run lint:fix

frontend-type-check:
	@echo "Running frontend type check..."
	cd $(FRONTEND_DIR) && npm run type-check

frontend-format:
	@echo "Formatting frontend code..."
	cd $(FRONTEND_DIR) && npm run format

# Run all checks
check-all: type-check fix format test frontend-type-check frontend-lint
	@echo "All checks complete!"
