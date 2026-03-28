"""WebSocket connection manager — track clients, broadcast diffs."""

import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts state diffs."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    @property
    def client_count(self) -> int:
        return len(self._connections)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.info("Client connected. Total: %d", self.client_count)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._connections:
            self._connections.remove(ws)
        logger.info("Client disconnected. Total: %d", self.client_count)

    async def broadcast(self, data: Any) -> None:
        """Send JSON data to all connected clients. Drop broken connections."""
        if not self._connections:
            return

        payload = data.model_dump() if hasattr(data, "model_dump") else data
        message = json.dumps(payload)

        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)
