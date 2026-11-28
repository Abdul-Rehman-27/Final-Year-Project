from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api import router
from app.core import settings
from app.db import initialize


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize()
    yield


app = FastAPI(title="Medical Assistant Services", version="0.1.0", lifespan=lifespan, description="Separate patient chatbot and doctor clinical summarizer APIs.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-API-Key"])
app.include_router(router)
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.is_dir():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="react-frontend")
else:
    @app.get("/", include_in_schema=False)
    def frontend_not_built():
        return {"service": "Medical Assistant Services", "frontend": "Run the React/Vite app from medical-assistant/frontend (npm run dev).", "api_docs": "/docs"}
