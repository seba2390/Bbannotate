---
applyTo: "*.py"
---
# Python Coding Guidelines

Follow these rules for all Python code generation in this workspace.

## Language & Style
- Target **Python 3.12+**
- Follow **PEP 8** style guidelines
- Use **modern type hints** (built-in generics):
  - `list[str]` instead of `List[str]`
  - `dict[str, int]` instead of `Dict[str, int]`
  - `tuple[int, ...]` instead of `Tuple[int, ...]`
- Always include type hints for:
  - Function parameters
  - Return types
  - Class attributes where type isn't obvious

## Core Principles

### Code Quality
- Write **clean, readable, and maintainable code** that prioritizes clarity over cleverness
- Follow **SOLID principles** and established design patterns
- Ensure all code is **self-documenting** with clear naming conventions and minimal but effective comments
- Maintain **consistent code style** throughout the project
- Keep functions **small and focused** (single responsibility)
- Use **descriptive variable and function names** that clearly describe their purpose and behavior
- Prefer explicit over implicit

### Function Design
- **Avoid large monolithic functions** - Break down complex operations into smaller, focused functions
- Each function should do one thing and do it well
- **Keep functions under 50 lines** when possible; if a function exceeds this, consider refactoring
- Use meaningful function names that clearly describe their purpose and behavior
- **Limit function parameters to 3-4**; consider using objects/dataclasses for functions requiring more inputs

### Separation of Concerns
- Divide code into distinct modules with single, well-defined responsibilities
- Keep business logic separate from presentation and data access layers
- Use dependency injection to manage component dependencies
- Avoid tight coupling between components

## Documentation
- Add **docstrings for non-trivial functions and classes** (Google or NumPy style)
- Write clear, concise documentation for public APIs and complex algorithms
- Document non-obvious decisions, trade-offs, and assumptions
- Keep documentation up-to-date with code changes

## Best Practices
- Use `pathlib.Path` for file operations instead of `os.path`
- Prefer f-strings for string formatting
- Write efficient code, but **prioritize readability and correctness first**
- Validate and sanitize all external inputs
- Handle errors gracefully and provide meaningful error messages

## Imports
- Group imports: standard library, third-party, local
- Use absolute imports over relative when possible
- Avoid wildcard imports (`from module import *`)

## Testing Philosophy

### Focus on Functionality Over Implementation
- **Test what the code does, not how it does it** - Write tests that verify behavior and outcomes
- Avoid testing implementation details that may change during refactoring
- Design tests that remain valid when internal implementation evolves
- Use test doubles (mocks, stubs) judiciously; prefer real dependencies when practical
- Focus on edge cases, boundary conditions, and error scenarios

### Test Structure
- Write tests for new functionality
- Use **descriptive test names** that explain the scenario and expected outcome
- Follow the **Arrange-Act-Assert (AAA)** pattern for clear test organization
- Keep tests **independent and isolated** from one another
- Ensure tests are **deterministic** and produce consistent results
- Maintain test code with the same quality standards as production code

## Problem Solving and Debugging

### Root Cause Analysis
- **Never implement superficial fixes** that merely suppress warnings or errors
- Always investigate and understand the underlying cause of issues
- Trace problems to their source rather than treating symptoms
- Consider the broader impact of fixes on the system architecture

### World-Class Solutions
- Implement comprehensive fixes that address the root problem completely
- Consider edge cases and potential side effects of any solution
- Prefer solutions that improve overall code quality and maintainability
- Document complex fixes with clear explanations of the problem and solution rationale
- If a warning or error appears, determine why it exists before deciding whether to fix or suppress it

## Building and Tooling
- **Any warnings arising during the build process must be addressed professionally** - do not ignore or suppress them, but resolve the underlying issues
- Utilize linters, formatters, and static analysis tools via make commands
- **ALWAYS prefer the make commands** for installing, cleaning, type-checking, formatting, and testing
- If make commands don't cover your needs, use the `.venv` located in the root of this repository

### Available Make Commands
- `make clean` - Clean up cache files, build artifacts, and virtual environment
- `make install` - Install dependencies in a fresh virtual environment
- `make type-check` - Run type checking with pyright on src/ directory
- `make fix` - Auto-fix linting issues with ruff
- `make format` - Format code with ruff
- `make test` - Run tests with pytest
- `make test-cov` - Run tests with coverage report

### End of Session Checklist
**ALWAYS RUN:** `make fix && make format && make type-check && make test` at the end of each session and fix any issues found before declaring the session complete.

## Code Review Mindset
- Write code as if it will be reviewed by senior engineers
- Consider future maintainers who will need to understand and modify your code
- Leave the codebase better than you found it
- Refactor opportunistically when touching existing code

---

**Remember:** Clean, testable, and well-structured code is not a luxury—it's a professional standard. Every line of code is a communication with future developers, including your future self.
