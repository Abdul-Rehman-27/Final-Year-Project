import httpx
from app.core import settings


class TokenLimitReached(Exception):
    pass


def _error_text(response):
    try:
        return str(response.json().get("error", {}).get("message", response.text)).lower()
    except Exception:
        return response.text.lower()


def _token_limit(text):
    return any(term in text for term in ("context_length", "maximum context", "token limit", "tokens per minute", "tokens per day", "too many tokens", "prompt is too long"))


async def groq_chat(messages, max_tokens=1500, json_mode=False):
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GroqCloud API key is not configured.")
    async with httpx.AsyncClient(timeout=90) as client:
        body = {"model": settings.GROQ_MODEL, "messages": messages, "max_completion_tokens": max_tokens, "temperature": 0.1}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        response = await client.post(f"{settings.GROQ_BASE_URL.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"}, json=body)
    if response.is_error:
        message = _error_text(response)
        if _token_limit(message):
            raise TokenLimitReached(message)
        raise RuntimeError(f"GroqCloud request failed ({response.status_code}).")
    payload = response.json()
    choice = payload["choices"][0]
    return {"text": choice["message"]["content"], "usage": payload.get("usage", {}), "provider": "groq", "model": settings.GROQ_MODEL, "finish_reason": choice.get("finish_reason")}


async def ollama_chat(messages, max_tokens=700, json_mode=False):
    async with httpx.AsyncClient(timeout=120) as client:
        tags = await client.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags")
        tags.raise_for_status()
        available = [model["name"] for model in tags.json().get("models", [])]
        model = settings.OLLAMA_MODEL or (available[0] if available else "")
        if not model or model not in available:
            raise RuntimeError("No available Ollama model is configured or installed.")
        request_body = {"model": model, "messages": messages, "stream": False, "options": {"num_predict": max_tokens, "temperature": 0.1}}
        if json_mode:
            request_body["format"] = "json"
        response = await client.post(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat", json=request_body)
        response.raise_for_status()
    payload = response.json()
    prompt = payload.get("prompt_eval_count", 0)
    completion = payload.get("eval_count", 0)
    return {"text": payload["message"]["content"], "usage": {"prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": prompt + completion}, "provider": "ollama", "model": model, "finish_reason": "stop"}


async def chat(messages, max_tokens=700, json_mode=False):
    try:
        result = await groq_chat(messages, max_tokens, json_mode)
        if result.get("finish_reason") == "length":
            return await ollama_chat(messages, max_tokens, json_mode)
        return result
    except TokenLimitReached:
        return await ollama_chat(messages, max_tokens, json_mode)


async def connectivity():
    primary = {"connected": False, "configured": bool(settings.GROQ_API_KEY), "model": settings.GROQ_MODEL}
    if settings.GROQ_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(f"{settings.GROQ_BASE_URL.rstrip('/')}/models", headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"})
                primary["connected"] = response.is_success
        except httpx.HTTPError:
            pass
    fallback = {"connected": False, "models": []}
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            response = await client.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags")
            if response.is_success:
                fallback["models"] = [model.get("name") for model in response.json().get("models", [])]
                fallback["connected"] = bool(fallback["models"])
    except httpx.HTTPError:
        pass
    return {"primary": primary, "fallback": fallback, "active": "groq" if primary["connected"] else ("ollama" if fallback["connected"] else "none")}
