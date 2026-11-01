from fastapi import APIRouter

from app.api.v1.routes import auth, chatbot, chatbot_admin

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(chatbot.router)
api_router.include_router(chatbot_admin.router)
