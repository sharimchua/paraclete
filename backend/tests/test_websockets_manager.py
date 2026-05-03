import pytest
import json
from unittest.mock import AsyncMock, patch

from fastapi import WebSocket
from backend.websockets_manager import ConnectionManager


@pytest.fixture
def connection_manager():
    return ConnectionManager()


@pytest.fixture
def mock_websocket():
    ws = AsyncMock(spec=WebSocket)
    return ws


@pytest.mark.asyncio
async def test_broadcast_success(connection_manager, mock_websocket):
    await connection_manager.connect(mock_websocket)
    message = {"event": "test_event", "data": "test_data"}

    await connection_manager.broadcast(message)

    mock_websocket.send_text.assert_called_once_with(json.dumps(message))


@pytest.mark.asyncio
async def test_broadcast_exception_caught(connection_manager, mock_websocket):
    await connection_manager.connect(mock_websocket)
    message = {"event": "test_event", "data": "test_data"}

    # Mock send_text to raise an Exception
    mock_websocket.send_text.side_effect = Exception("WebSocket Error")

    # Patch builtins.print to verify the error is printed and caught
    with patch("builtins.print") as mock_print:
        # The broadcast should NOT raise an exception
        await connection_manager.broadcast(message)

        # Verify send_text was called
        mock_websocket.send_text.assert_called_once_with(json.dumps(message))

        # Verify the exception was caught and printed
        mock_print.assert_called_once_with(
            "Error broadcasting message: WebSocket Error"
        )
