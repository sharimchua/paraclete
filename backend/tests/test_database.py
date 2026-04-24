from unittest.mock import patch, MagicMock
from backend.database import get_db


def test_get_db():
    with patch("backend.database.SessionLocal") as mock_session_local:
        mock_session = MagicMock()
        mock_session_local.return_value = mock_session

        db_gen = get_db()
        db = next(db_gen)

        assert db is mock_session
        mock_session_local.assert_called_once()
        mock_session.close.assert_not_called()

        try:
            next(db_gen)
        except StopIteration:
            pass

        mock_session.close.assert_called_once()
