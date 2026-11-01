import httpx

from app.core.config import settings


class MedicalAssistantError(Exception):
    pass


def _headers() -> dict[str, str]:
    return {"X-API-Key": settings.MEDICAL_ASSISTANT_API_KEY} if settings.MEDICAL_ASSISTANT_API_KEY else {}


async def request(method: str, path: str, *, json: dict | None = None, params: dict | None = None):
    try:
        async with httpx.AsyncClient(base_url=settings.MEDICAL_ASSISTANT_URL.rstrip("/"), timeout=120) as client:
            response = await client.request(method, path, json=json, params=params, headers=_headers())
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise MedicalAssistantError("The Medical Assistant service is unavailable.") from exc


async def get_service_status():
    try:
        status = await request("GET", "/api/v1/health")
        return {"available": True, "status": status}
    except MedicalAssistantError:
        return {"available": False, "status": None}
