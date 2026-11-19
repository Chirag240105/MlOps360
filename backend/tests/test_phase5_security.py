import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.security import create_access_token, decode_access_token, hash_password, verify_password


class TestPhase5Security(unittest.TestCase):
    def test_scrypt_password_hash_and_verify(self) -> None:
        hashed = hash_password("ModelOpsSecure#2026")
        self.assertTrue(hashed.startswith("scrypt$"))
        self.assertTrue(verify_password("ModelOpsSecure#2026", hashed))
        self.assertFalse(verify_password("wrong", hashed))

    def test_jwt_roundtrip_and_tamper_rejection(self) -> None:
        token = create_access_token({"sub": "u1", "role": "Admin"}, secret="dev-secret-key")
        decoded = decode_access_token(token, secret="dev-secret-key")
        self.assertEqual(decoded["role"], "Admin")
        with self.assertRaises(ValueError):
            decode_access_token(token + "x", secret="dev-secret-key")


if __name__ == "__main__":
    unittest.main()
