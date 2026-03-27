"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "OpenMaven"
    version: str = "0.1.0"
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {"env_prefix": "OPENMAVEN_"}


settings = Settings()
