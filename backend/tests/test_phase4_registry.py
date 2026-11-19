import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.registry_governance import ModelStage, validate_stage_transition


class TestPhase4RegistryGovernance(unittest.TestCase):
    def test_valid_lifecycle_progression(self) -> None:
        validate_stage_transition(ModelStage.DEVELOPMENT, ModelStage.CANDIDATE)
        validate_stage_transition(ModelStage.CANDIDATE, ModelStage.STAGING)
        validate_stage_transition(ModelStage.STAGING, ModelStage.PRODUCTION)
        validate_stage_transition(ModelStage.ARCHIVED, ModelStage.PRODUCTION)

    def test_illegal_transitions_raise_value_error(self) -> None:
        with self.assertRaises(ValueError):
            validate_stage_transition(ModelStage.DEVELOPMENT, ModelStage.PRODUCTION)
        with self.assertRaises(ValueError):
            validate_stage_transition(ModelStage.REJECTED, ModelStage.PRODUCTION)
        with self.assertRaises(ValueError):
            validate_stage_transition(ModelStage.PRODUCTION, ModelStage.PRODUCTION)


if __name__ == "__main__":
    unittest.main()
