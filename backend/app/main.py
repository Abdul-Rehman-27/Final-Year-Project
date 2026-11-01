from contextlib import asynccontextmanager
import asyncio

import jwt
from fastapi import WebSocket, WebSocketDisconnect

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (register models)
from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import engine, SessionLocal
from app.db.migrations.v001_chatbot_admin import upgrade as migrate_chatbot_admin
from app.models.user import User
from app.core.security import decode_access_token
from app.services.admin_health import monitor_services
from app.services.chatbot_admin import build_initial_state
from app.services.websocket_manager import manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Apply the chatbot admin schema upgrade and start one server-side health monitor.
    migrate_chatbot_admin(engine)
    health_task = asyncio.create_task(monitor_services())
    yield
    health_task.cancel()
    try:
        await health_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="CityHospital API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Vite may move from 5173 to 5174 when the default port is already in use.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):517\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.websocket("/ws/admin/knowledge-base")
async def admin_knowledge_base_socket(websocket: WebSocket):
    """Authenticate the admin from the first WebSocket message and stream updates."""
    await websocket.accept()
    try:
        auth_message = await asyncio.wait_for(websocket.receive_json(), timeout=10)
        if not isinstance(auth_message, dict) or auth_message.get("type") != "authenticate" or not isinstance(auth_message.get("token"), str):
            await websocket.close(code=4401, reason="Authentication required")
            return
        token_data = decode_access_token(auth_message["token"])
        db = SessionLocal()
        try:
            user = db.get(User, int(token_data["sub"]))
            if not user or not user.is_active or user.role != "admin":
                await websocket.close(code=4403, reason="Admin access required")
                return
            manager.connect(websocket)
            health = manager.latest_health or {"available": False, "status": None}
            state = build_initial_state(db, health)
            await manager.send_event(websocket, "initial_state", state)
        finally:
            db.close()

        last_pong = asyncio.get_running_loop().time()
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=25)
            except asyncio.TimeoutError:
                if asyncio.get_running_loop().time() - last_pong >= 50:
                    await websocket.close(code=1011, reason="Heartbeat timed out")
                    break
                await manager.send_event(websocket, "ping", {})
                continue
            if message.get("type") == "pong":
                last_pong = asyncio.get_running_loop().time()
            elif message.get("type") == "ping":
                await manager.send_event(websocket, "pong", {})
    except (jwt.PyJWTError, KeyError, ValueError, TypeError, AttributeError, asyncio.TimeoutError):
        await websocket.close(code=4401, reason="Invalid or expired token")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
