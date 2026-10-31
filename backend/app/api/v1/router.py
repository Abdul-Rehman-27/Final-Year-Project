from fastapi import APIRouter

from app.api.v1.routes import auth

api_router = APIRouter()
api_router.include_router(auth.router)
# Future routers: doctors, appointments, records, chatbot, summarizer, admin ...
