import json
from typing import List
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict, db=None):
        event = message.get("event")
        if db and event and event.startswith("llm_"):
            try:
                # Use local import to avoid circular dependency
                from .models import Setting

                setting_key = f"forensic_{event}"
                visibility = (
                    db.query(Setting).filter(Setting.key == setting_key).first()
                )
                if visibility and visibility.value == "false":
                    return  # Skip broadcasting if disabled
            except Exception as e:
                print(f"Forensic filter error: {e}")

        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                print(f"Error broadcasting message: {e}")


# Shared singleton instance
ws_manager = ConnectionManager()
