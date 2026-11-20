from functools import lru_cache
from typing import List
from pydantic import Field

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:
    from pydantic import BaseModel as BaseSettings

    def SettingsConfigDict(**kwargs):
        return kwargs


class Settings(BaseSettings):
    """Typed environment-driven application configuration (12-Factor compliant)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = Field(default="ModelOps360")
    app_env: str = Field(default="development")
    log_level: str = Field(default="INFO")
    port: int = Field(default=8000, ge=1, le=65535)

    # Security (override via environment; never commit real secrets)
    jwt_secret: str = Field(default="CHANGE_ME_LOCAL_DEV_ONLY_MIN_32_CHARS")
    jwt_algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=60, ge=5)
    allowed_origins_raw: str = Field(default="http://localhost:3000", alias="ALLOWED_ORIGINS")

    # PostgreSQL & Artifact Storage
    database_url_raw: str = Field(
        default="postgresql+psycopg://modelops:CHANGE_ME@localhost:5432/modelops360",
        alias="DATABASE_URL",
    )

    @property
    def database_url(self) -> str:
        url = self.database_url_raw
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url[len("postgresql://"):]
        return url
    mlflow_tracking_uri: str = Field(default="http://localhost:5000")
    mlflow_experiment_name: str = Field(default="retail-demand-forecasting")
    artifact_storage_path: str = Field(default="./artifacts")

    # Governance & Drift Policies
    drift_psi_threshold: float = Field(default=0.20, gt=0.0)
    drift_ks_pvalue_threshold: float = Field(default=0.05, gt=0.0, lt=1.0)
    retraining_cooldown_hours: int = Field(default=24, ge=1)
    min_promotion_rmse_improvement: float = Field(default=0.02, ge=0.0)

    @property
    def allowed_origins(self) -> List[str]:
        return [origin.strip() for origin in self.allowed_origins_raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton so environment parsing occurs once per process."""
    return Settings()
