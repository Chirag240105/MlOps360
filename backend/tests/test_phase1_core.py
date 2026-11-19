import json
import logging
import sys
import unittest
from pathlib import Path

# Allow running from repository root without editable install
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.exceptions import GovernancePolicyError, ResourceNotFoundError, ValidationFailedError
from app.core.logging import JsonLogFormatter, configure_logging


class TestPhase1Core(unittest.TestCase):
    def test_structured_json_formatter_emits_valid_json(self) -> None:
        formatter = JsonLogFormatter(service_name="ModelOps360-Test")
        record = logging.LogRecord(
            name="modelops360.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="phase1 health check",
            args=(),
            exc_info=None,
        )
        record.request_id = "req-123"
        record.extra_fields = {"component": "unit-test"}

        parsed = json.loads(formatter.format(record))
        self.assertEqual(parsed["service"], "ModelOps360-Test")
        self.assertEqual(parsed["level"], "INFO")
        self.assertEqual(parsed["message"], "phase1 health check")
        self.assertEqual(parsed["request_id"], "req-123")
        self.assertEqual(parsed["component"], "unit-test")

    def test_configure_logging_sets_level(self) -> None:
        logger = configure_logging(level="WARN", service_name="ModelOps360")
        self.assertEqual(logger.level, logging.WARN)
        self.assertEqual(len(logger.handlers), 1)

    def test_domain_exceptions_carry_status_codes(self) -> None:
        val_err = ValidationFailedError("bad schema", details={"column": "units_sold"})
        not_found = ResourceNotFoundError("ModelVersion", "v1.0")
        policy_err = GovernancePolicyError("cooldown active")

        self.assertEqual(val_err.status_code, 400)
        self.assertEqual(not_found.status_code, 404)
        self.assertEqual(policy_err.status_code, 422)


if __name__ == "__main__":
    unittest.main()
