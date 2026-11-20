import sys
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from ...core.config import get_settings

router = APIRouter(tags=["system"])


@router.get("/health")
def health_check(request: Request) -> dict:
    """Liveness and basic runtime diagnostics endpoint."""
    settings = get_settings()
    return {
        "status": "healthy",
        "service": settings.app_name,
        "environment": settings.app_env,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request_id": getattr(request.state, "request_id", None),
        "python_version": sys.version.split()[0],
    }
