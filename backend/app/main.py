import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .api.routes.health import router as health_router
from .api.routes.models import router as models_router
from .api.routes.training import router as training_router
from .core.config import get_settings
from .core.exceptions import ModelOpsError
from .core.logging import configure_logging

settings = get_settings()
logger = configure_logging(level=settings.log_level, service_name=settings.app_name)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info(
        "ModelOps360 FastAPI control plane starting",
        extra={"extra_fields": {"environment": settings.app_env}},
    )
    yield
    logger.info("ModelOps360 FastAPI control plane shutting down")


def create_app() -> FastAPI:
    app = FastAPI(
        title="ModelOps360 API",
        description="Intelligent ML Model Monitoring, Drift Detection & Automated Retraining Platform",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def attach_request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "HTTP request completed",
            extra={
                "request_id": request_id,
                "extra_fields": {
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                },
            },
        )
        return response

    @app.exception_handler(ModelOpsError)
    async def handle_domain_error(request: Request, exc: ModelOpsError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                    "request_id": getattr(request.state, "request_id", None),
                }
            },
        )

    app.include_router(health_router)
    app.include_router(models_router)
    app.include_router(training_router)
    return app


app = create_app()
