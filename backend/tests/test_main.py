import pytest
from unittest.mock import patch
from backend.main import get_local_ip

def test_get_local_ip_exception_fallback():
    """
    Test that when all socket resolution methods throw an exception,
    get_local_ip() falls back to "127.0.0.1".
    """
    # We patch the socket module where it is used in backend.main
    with patch("backend.main.socket.socket", side_effect=Exception("Method 1 fail")), \
         patch("backend.main.socket.gethostname", side_effect=Exception("Method 2 fail")), \
         patch("backend.main.socket.getaddrinfo", side_effect=Exception("Method 3 fail")):

        ip = get_local_ip()
        assert ip == "127.0.0.1"
