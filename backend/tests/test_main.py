from unittest.mock import patch, MagicMock
from backend.main import get_local_ip


def test_get_local_ip_method1_success():
    with patch("backend.main.socket.socket") as mock_socket:
        mock_sock_instance = MagicMock()
        mock_sock_instance.getsockname.return_value = ("192.168.1.10", 12345)
        mock_socket.return_value = mock_sock_instance

        ip = get_local_ip()

        assert ip == "192.168.1.10"
        mock_sock_instance.connect.assert_called_once_with(("8.8.8.8", 80))


def test_get_local_ip_method1_loopback_fallback_to_method2():
    with (
        patch("backend.main.socket.socket") as mock_socket,
        patch("backend.main.socket.gethostname") as mock_gethostname,
        patch("backend.main.socket.gethostbyname") as mock_gethostbyname,
    ):
        mock_sock_instance = MagicMock()
        mock_sock_instance.getsockname.return_value = ("127.0.0.1", 12345)
        mock_socket.return_value = mock_sock_instance

        mock_gethostname.return_value = "myhost"
        mock_gethostbyname.return_value = "192.168.1.20"

        ip = get_local_ip()

        assert ip == "192.168.1.20"
        mock_gethostname.assert_called_once()
        mock_gethostbyname.assert_called_once_with("myhost")


def test_get_local_ip_method1_exception_fallback_to_method2():
    with (
        patch("backend.main.socket.socket", side_effect=Exception("Network error")),
        patch("backend.main.socket.gethostname") as mock_gethostname,
        patch("backend.main.socket.gethostbyname") as mock_gethostbyname,
    ):
        mock_gethostname.return_value = "myhost"
        mock_gethostbyname.return_value = "192.168.1.30"

        ip = get_local_ip()

        assert ip == "192.168.1.30"


def test_get_local_ip_method1_and_2_fail_fallback_to_method3():
    with (
        patch("backend.main.socket.socket", side_effect=Exception("M1 fail")),
        patch("backend.main.socket.gethostname") as mock_gethostname,
        patch("backend.main.socket.gethostbyname", side_effect=Exception("M2 fail")),
        patch("backend.main.socket.getaddrinfo") as mock_getaddrinfo,
    ):
        mock_gethostname.return_value = "myhost"
        mock_getaddrinfo.return_value = [
            (None, None, None, None, ("127.0.0.1", 0)),
            (None, None, None, None, ("192.168.1.40", 0)),
        ]

        ip = get_local_ip()

        assert ip == "192.168.1.40"
        mock_getaddrinfo.assert_called_once_with("myhost", None)


def test_get_local_ip_all_fail():
    with (
        patch("backend.main.socket.socket", side_effect=Exception("M1 fail")),
        patch("backend.main.socket.gethostname", side_effect=Exception("M2/M3 fail")),
    ):
        ip = get_local_ip()

        assert ip == "127.0.0.1"


def test_get_local_ip_method3_only_loopback():
    with (
        patch("backend.main.socket.socket", side_effect=Exception("M1 fail")),
        patch("backend.main.socket.gethostname") as mock_gethostname,
        patch("backend.main.socket.gethostbyname", side_effect=Exception("M2 fail")),
        patch("backend.main.socket.getaddrinfo") as mock_getaddrinfo,
    ):
        mock_gethostname.return_value = "myhost"
        mock_getaddrinfo.return_value = [
            (None, None, None, None, ("127.0.0.1", 0)),
            (None, None, None, None, ("127.0.1.1", 0)),
        ]

        ip = get_local_ip()

        assert ip == "127.0.0.1"
