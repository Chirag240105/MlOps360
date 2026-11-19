from typing import Any, Optional


class ModelOpsError(Exception):
    """Base domain exception for ModelOps360."""

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        code: str = "INTERNAL_ERROR",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details


class ValidationFailedError(ModelOpsError):
    def __init__(self, message: str, details: Optional[Any] = None) -> None:
        super().__init__(message, status_code=400, code="VALIDATION_ERROR", details=details)


class ResourceNotFoundError(ModelOpsError):
    def __init__(self, resource: str, identifier: str) -> None:
        super().__init__(
            f"{resource} '{identifier}' was not found",
            status_code=404,
            code="NOT_FOUND",
            details={"resource": resource, "identifier": identifier},
        )


class GovernancePolicyError(ModelOpsError):
    def __init__(self, message: str, details: Optional[Any] = None) -> None:
        super().__init__(message, status_code=422, code="POLICY_VIOLATION", details=details)
