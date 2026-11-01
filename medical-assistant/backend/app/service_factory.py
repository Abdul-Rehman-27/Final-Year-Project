from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router
from app.core import settings
from app.db import initialize


def create_service(name: str, prefixes: tuple[str, ...]):
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        initialize()
        yield

    service = FastAPI(title=name, version="0.1.0", lifespan=lifespan)
    service.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-API-Key"])
    # Routes are shared as code, but each service exposes only its own API boundary.
    service.router.routes.extend(route for route in router.routes if route.path == "/api/v1/health" or any(route.path.startswith(prefix) for prefix in prefixes))
    return service
