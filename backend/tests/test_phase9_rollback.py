import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.services.registry_governance import check_promotion_gate, select_rollback_candidate


class TestPhase9RollbackAndPromotion(unittest.TestCase):
    def test_select_rollback_candidate_never_selects_rejected(self) -> None:
        versions = [
            {"id": "v1", "version_number": 1, "stage": "Archived"},
            {"id": "v2", "version_number": 2, "stage": "Rejected"},
            {"id": "v3", "version_number": 3, "stage": "Production"},
        ]
        chosen = select_rollback_candidate(versions)
        self.assertIsNotNone(chosen)
        assert chosen is not None
        self.assertEqual(chosen["id"], "v1")

    def test_promotion_gate_blocks_worse_rmse_unless_overridden(self) -> None:
        self.assertFalse(check_promotion_gate(champion_rmse=7.5, challenger_rmse=12.1))
        self.assertTrue(check_promotion_gate(champion_rmse=7.5, challenger_rmse=12.1, force_override=True))
        self.assertTrue(check_promotion_gate(champion_rmse=12.1, challenger_rmse=7.5))


if __name__ == "__main__":
    unittest.main()
