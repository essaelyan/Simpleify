from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "AI Marketing Engine"
    APP_ENV: Literal["development", "production"] = "development"
    APP_VERSION: str = "1.0.0"
    APP_SECRET_KEY: str = "change-me-in-production"
    APP_BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:5173"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/ai_marketing"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # JWT
    JWT_SECRET_KEY: str = "change-me-jwt-secret-32chars-minimum"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Google Cloud
    GOOGLE_CLOUD_PROJECT: str = ""
    GOOGLE_CLOUD_LOCATION: str = "us-central1"
    GOOGLE_APPLICATION_CREDENTIALS: str = ""
    GCS_BUCKET_NAME: str = "ai-marketing-media"
    STORAGE_BACKEND: Literal["local", "gcs"] = "local"
    LOCAL_STORAGE_PATH: str = "./storage/media"

    # AI Models
    IMAGEN_MODEL: str = "imagen-3.0-generate-001"
    GEMINI_PRO_MODEL: str = "gemini-1.5-pro-002"
    GEMINI_FLASH_MODEL: str = "gemini-1.5-flash-002"
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # Kling AI
    KLING_API_KEY: str = ""
    KLING_API_SECRET: str = ""
    KLING_API_BASE_URL: str = "https://api.klingai.com"
    KLING_MODEL_VERSION: str = "kling-v1-6"
    KLING_VIDEO_ASPECT_RATIO: str = "9:16"

    # Buffer
    BUFFER_CLIENT_ID: str = ""
    BUFFER_CLIENT_SECRET: str = ""
    BUFFER_REDIRECT_URI: str = "http://localhost:8000/api/v1/schedule/callback"
    BUFFER_WEBHOOK_SECRET: str = ""

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_MIN_FUND_AMOUNT: float = 5.00
    STRIPE_MAX_FUND_AMOUNT: float = 500.00

    # Encryption
    FERNET_KEY: str = ""

    # Monitoring
    SENTRY_DSN: str = ""
    LOG_LEVEL: str = "INFO"

    # Upload limits
    MAX_UPLOAD_SIZE_MB: int = 50

    # Generation costs
    @property
    def GENERATION_COSTS(self) -> dict:
        return {
            "static_image": 0.10,
            "carousel": 0.40,
            "story": 0.10,
            "reel": 0.50,
            "weekly_pack": 1.50,
        }


settings = Settings()
