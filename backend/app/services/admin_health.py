import asyncio

from app.db.session import SessionLocal
from app.services.chatbot_admin import build_initial_state, get_model_config, provider_health
from app.services.medical_assistant_client import get_service_status
from app.services.websocket_manager import manager


async def monitor_services():
    """Check model services on the server and publish only health changes."""
    while True:
        health = await get_service_status()
        manager.latest_health = health
        current = provider_health(health)
        if manager.latest_health_status is None or current != manager.latest_health_status:
            db = SessionLocal()
            try:
                get_model_config(db)
                state = build_initial_state(db, health)
                if manager.connections:
                    await manager.broadcast("service_status_changed", {"service": state["service"], "services": state["services"], "providers": state["providers"]})
            finally:
                db.close()
        manager.latest_health_status = current
        await asyncio.sleep(30)
