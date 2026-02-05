"""Shared test configuration and fixtures."""

import os

# Set high rate limit before importing app to avoid rate limiting in tests
# This must be done before any imports that load the routes module
os.environ.setdefault("BBANNOTATE_UPLOAD_RATE_LIMIT", "10000/minute")
