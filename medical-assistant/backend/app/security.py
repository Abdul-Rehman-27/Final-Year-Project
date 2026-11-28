from fastapi import Header, HTTPException
from app.core import settings


def require_scope(scope: str):
    async def dependency(x_api_key: str | None = Header(default=None)):
        # Format: secret=scope1|scope2; empty configuration permits local development.
        entries = [part.strip() for part in settings.MEDICAL_ASSISTANT_API_KEYS.split(",") if part.strip()]
        if not entries:
            return
        for entry in entries:
            try:
                secret, scopes = entry.split("=", 1)
            except ValueError:
                continue
            if x_api_key == secret and (scope in scopes.split("|") or "*" in scopes.split("|")):
                return
        raise HTTPException(403, "A valid API key with the required scope is required.")
    return dependency
