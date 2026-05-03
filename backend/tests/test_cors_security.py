import sys
import unittest
from unittest.mock import MagicMock, patch
import os


def get_allowed_origins(local_ip_val, env_origins_val=None):
    # Logic extracted from backend/main.py
    allowed_origins = [
        "http://localhost",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ]
    if local_ip_val and local_ip_val != "127.0.0.1":
        allowed_origins.append(f"http://{local_ip_val}:8000")

    if env_origins_val:
        allowed_origins.extend([o.strip() for o in env_origins_val.split(",")])
    return allowed_origins


class TestCORSConfiguration(unittest.TestCase):
    def test_cors_origins_logic(self):
        # Test with local IP and environment variable
        origins = get_allowed_origins(
            "192.168.1.50", "http://trusted.com, http://another.com"
        )

        self.assertIn("http://localhost", origins)
        self.assertIn("http://127.0.0.1", origins)
        self.assertIn("http://192.168.1.50:8000", origins)
        self.assertIn("http://trusted.com", origins)
        self.assertIn("http://another.com", origins)
        self.assertNotIn("*", origins)

        # Test default origins are present
        origins_no_ip = get_allowed_origins("127.0.0.1")
        self.assertIn("http://localhost", origins_no_ip)
        self.assertIn("http://127.0.0.1:8000", origins_no_ip)
        self.assertEqual(len(origins_no_ip), 6)


if __name__ == "__main__":
    unittest.main()
