import socket
from unittest.mock import patch, MagicMock
from backend.main import get_local_ip

def test_get_local_ip_fallback():
    """
    Test that get_local_ip returns '127.0.0.1' when all methods fail.
    """
    with patch("backend.main.socket.socket") as mock_socket, \
         patch("backend.main.socket.gethostname") as mock_gethostname, \
         patch("backend.main.socket.getaddrinfo") as mock_getaddrinfo:

        # Method 1 failure
        mock_socket.side_effect = Exception("Socket error")

        # Method 2 failure
        mock_gethostname.side_effect = Exception("Hostname error")

        # Method 3 failure
        mock_getaddrinfo.side_effect = Exception("Addrinfo error")

        assert get_local_ip() == "127.0.0.1"

def test_get_local_ip_method1_success():
    """
    Test Method 1: Connecting to external address.
    """
    with patch("backend.main.socket.socket") as mock_socket:
        mock_s = MagicMock()
        mock_socket.return_value = mock_s
        mock_s.getsockname.return_value = ["192.168.1.100", 80]

        assert get_local_ip() == "192.168.1.100"
        mock_s.connect.assert_called_with(("8.8.8.8", 80))

def test_get_local_ip_method2_success():
    """
    Test Method 2: socket.gethostbyname.
    """
    with patch("backend.main.socket.socket") as mock_socket, \
         patch("backend.main.socket.gethostname") as mock_gethostname, \
         patch("backend.main.socket.gethostbyname") as mock_gethostbyname:

        # Method 1 fails
        mock_socket.side_effect = Exception("Socket error")

        # Method 2 succeeds
        mock_gethostname.return_value = "my-laptop"
        mock_gethostbyname.return_value = "192.168.1.101"

        assert get_local_ip() == "192.168.1.101"
        mock_gethostbyname.assert_called_with("my-laptop")

def test_get_local_ip_method3_success():
    """
    Test Method 3: socket.getaddrinfo.
    """
    with patch("backend.main.socket.socket") as mock_socket, \
         patch("backend.main.socket.gethostname") as mock_gethostname, \
         patch("backend.main.socket.gethostbyname") as mock_gethostbyname, \
         patch("backend.main.socket.getaddrinfo") as mock_getaddrinfo:

        # Method 1 fails
        mock_socket.side_effect = Exception("Socket error")

        # Method 2 fails (e.g., returns loopback)
        mock_gethostname.return_value = "my-laptop"
        mock_gethostbyname.return_value = "127.0.0.1"

        # Method 3 succeeds
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.102", 0))
        ]

        assert get_local_ip() == "192.168.1.102"
