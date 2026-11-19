from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class GenerateDatasetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    days: int = Field(default=120, ge=15, le=730)
    start_date: str = Field(default="2026-01-01")
    seed: int = Field(default=42)
    scenario: Literal["reference", "corrupted", "drifted"] = "reference"
    description: Optional[str] = None


class ValidationCheckSchema(BaseModel):
    rule: str
    passed: bool
    severity: Literal["error", "warning"]
    message: str
    details: Dict[str, Any]


class DatasetVersionResponse(BaseModel):
    dataset_id: str
    name: str
    version_id: str
    version_number: int
    version_hash: str
    row_count: int
    validation_passed: bool
    checks: List[ValidationCheckSchema]
    created_at: Optional[datetime] = None
