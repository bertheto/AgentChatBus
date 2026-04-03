"""Contract tests: integration base URL must be centralized.

We intentionally keep the default integration-test base URL in one place
([tests/_constants.py](tests/_constants.py)) to prevent drift across test
modules, and to keep the dedicated test port (39769) consistent.

These tests are guardrails; they do not validate server behavior.
"""

from __future__ import annotations

from pathlib import Path


_LITERAL_BASE_URL = "http://127.0.0.1:39769"
_ENV_NAME = "AGENTCHATBUS_TEST_BASE_URL"


def test_integration_base_url_literal_not_duplicated_in_test_modules() -> None:
    tests_dir = Path(__file__).parent
    allowed_files = {
        (tests_dir / "_constants.py").resolve(),
        (tests_dir / "conftest.py").resolve(),
        (tests_dir / "test_http_base_url_contract.py").resolve(),
    }

    # Only enforce for test modules; allow helper modules to evolve.
    for path in tests_dir.glob("test_*.py"):
        resolved = path.resolve()
        if resolved in allowed_files:
            continue

        text = resolved.read_text(encoding="utf-8")
        assert _LITERAL_BASE_URL not in text, (
            f"Do not inline {_LITERAL_BASE_URL} in {path.name}. "
            "Import tests._constants.TEST_BASE_URL instead."
        )


def test_integration_base_url_env_not_duplicated_in_test_modules() -> None:
    tests_dir = Path(__file__).parent
    allowed_files = {
        (tests_dir / "_constants.py").resolve(),
        (tests_dir / "conftest.py").resolve(),
        (tests_dir / "test_http_base_url_contract.py").resolve(),
    }

    for path in tests_dir.glob("test_*.py"):
        resolved = path.resolve()
        if resolved in allowed_files:
            continue

        text = resolved.read_text(encoding="utf-8")
        assert _ENV_NAME not in text, (
            f"Do not read {_ENV_NAME} directly in {path.name}. "
            "Import tests._constants.TEST_BASE_URL instead."
        )
