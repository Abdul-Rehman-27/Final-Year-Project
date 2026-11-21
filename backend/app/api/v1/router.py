from fastapi import APIRouter

from app.api.v1.routes import admin_module, auth, chatbot, chatbot_admin, evaluation

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(chatbot.router)
api_router.include_router(chatbot_admin.router)
api_router.include_router(evaluation.router)
api_router.include_router(admin_module.router)
