import httpx

from app.core.config import settings


class MedicalAssistantError(Exception):
    pass


def _headers() -> dict[str, str]:
    return {"X-API-Key": settings.MEDICAL_ASSISTANT_API_KEY} if settings.MEDICAL_ASSISTANT_API_KEY else {}


async def request(method: str, path: str, *, json: dict | None = None, params: dict | None = None, timeout: float | None = 120):
    try:
        async with httpx.AsyncClient(base_url=settings.MEDICAL_ASSISTANT_URL.rstrip("/"), timeout=timeout) as client:
            response = await client.request(method, path, json=json, params=params, headers=_headers())
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        detail = (exc.response.text or "").strip().replace("\n", " ")[:300]
        raise MedicalAssistantError(f"Medical Assistant returned HTTP {exc.response.status_code}: {detail or 'no error details'}") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise MedicalAssistantError(f"Medical Assistant request failed: {type(exc).__name__}") from exc


async def get_service_status():
    try:
        status = await request("GET", "/api/v1/health")
        return {"available": True, "status": status}
    except MedicalAssistantError:
        return {"available": False, "status": None}
async def summarize_text(patient_id: str, filename: str, text: str) -> dict:
    """Request the existing medical-assistant summary service without logging PHI."""
    headers = {"X-API-Key": settings.MEDICAL_ASSISTANT_API_KEY} if settings.MEDICAL_ASSISTANT_API_KEY else {}
    try:
        async with httpx.AsyncClient(base_url=settings.MEDICAL_ASSISTANT_URL.rstrip("/"), timeout=60) as client:
            response = await client.post("/api/v1/summaries", data={"patient_id": patient_id}, files={"file": (filename, text.encode("utf-8"), "text/plain")}, headers=headers)
            response.raise_for_status()
            fields = response.json()["fields"]
            if not isinstance(fields, dict): raise ValueError("invalid fields")
            return fields
    except Exception as exc:
        raise MedicalAssistantError("summary unavailable") from exc
