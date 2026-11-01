from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = ""
    MEDICAL_ASSISTANT_DB: str = str(PROJECT_ROOT / "medical-assistant" / "data.sqlite3")
    MEDICAL_ASSISTANT_API_KEYS: str = ""
    MEDICAL_ASSISTANT_CORS_ORIGINS: str = "http://localhost:5174,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000"
    MAX_UPLOAD_MB: int = 15
    MAX_MESSAGE_CHARS: int = 5000
    model_config = SettingsConfigDict(env_file=(str(PROJECT_ROOT / "medical-assistant" / ".env"), str(PROJECT_ROOT / "backend" / ".env")), extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.MEDICAL_ASSISTANT_CORS_ORIGINS.split(",") if item.strip()]


settings = Settings()
