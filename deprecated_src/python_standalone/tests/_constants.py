"""Shared test constants.

Centralizes the default test server base URL so integration tests don't drift.

Notes:
- This URL must never point at the production port (39765).
- Tests may still override via AGENTCHATBUS_TEST_BASE_URL when running against
  an externally managed server, but the default remains the dedicated test port.
"""

from __future__ import annotations

import os

DEFAULT_TEST_PORT = 39769
DEFAULT_TEST_BASE_URL = "http://127.0.0.1:39769"

if not DEFAULT_TEST_BASE_URL.endswith(f":{DEFAULT_TEST_PORT}"):
  raise RuntimeError("DEFAULT_TEST_BASE_URL must match DEFAULT_TEST_PORT.")

if DEFAULT_TEST_PORT == 39765:
    raise RuntimeError("DEFAULT_TEST_PORT must never be the production port 39765.")

TEST_BASE_URL_ENV = "AGENTCHATBUS_TEST_BASE_URL"
TEST_BASE_URL = os.getenv(TEST_BASE_URL_ENV, DEFAULT_TEST_BASE_URL)
