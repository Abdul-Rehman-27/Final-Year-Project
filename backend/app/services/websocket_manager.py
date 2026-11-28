from datetime import datetime, timezone


class AdminSocketManager:
    """Keep connected admin pages and send them small state-change events."""

    def __init__(self):
        self.connections = set()
        self.latest_health = None
        self.latest_health_status = None

    def connect(self, websocket):
        self.connections.add(websocket)

    def disconnect(self, websocket):
        self.connections.discard(websocket)

    async def send_event(self, websocket, event_type: str, data: dict):
        """Send one timestamped event to a single connection."""
        await websocket.send_json({"type": event_type, "data": data, "timestamp": datetime.now(timezone.utc).isoformat()})

    async def broadcast(self, event_type: str, data: dict):
        """Send an event to every admin page and remove broken connections."""
        broken = []
        for websocket in list(self.connections):
            try:
                await self.send_event(websocket, event_type, data)
            except Exception:
                broken.append(websocket)
        for websocket in broken:
            self.disconnect(websocket)


manager = AdminSocketManager()
