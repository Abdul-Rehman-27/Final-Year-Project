from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables / .env file."""

    DATABASE_URL: str = "postgresql+psycopg2://cityhospital:cityhospital@localhost:5432/cityhospital"
    SECRET_KEY: str = "dev-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CORS_ORIGINS: str = "http://localhost:5173"
    MEDICAL_ASSISTANT_URL: str = "http://localhost:8010"
    MEDICAL_ASSISTANT_API_KEY: str = ""
    GROQ_MONTHLY_TOKEN_LIMIT: int = 0

    SEED_ADMIN_EMAIL: str = "harooonijaz123@gmail.com"
    SEED_ADMIN_PASSWORD: str = "Admin@12345"
    SEED_DOCTOR_EMAIL: str = "imran.malik@cityhospital.pk"
    SEED_DOCTOR_PASSWORD: str = "Doctor@12345"
    SEED_DEMO_PATIENT_PASSWORD: str = "Patient@12345"

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_USE_TLS: bool = True
    PASSWORD_RESET_CODE_TTL_MINUTES: int = 10

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
