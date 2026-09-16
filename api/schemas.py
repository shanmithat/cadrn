"""API Schemas re-exporting and extending core schemas for FastAPI documentation."""

from pydantic import BaseModel, Field
from core.schemas import (
    AssemblySummary,
    BoundingEnvelope,
    CADProfileResponse,
    ComponentClass,
    ComponentProfile,
    DFMReport,
    InertiaTensorData,
    ManufacturingProcess,
    OrientedBoundingBox,
    SurfaceType,
    TaskStatus,
)


class TaskSubmissionResponse(BaseModel):
    task_id: str = Field(..., description="Unique asynchronous task ID")
    filename: str = Field(..., description="Uploaded file name")
    status: TaskStatus = Field(TaskStatus.PENDING, description="Initial task status")
    message: str = Field(..., description="Task submission acknowledgement")
    status_url: str = Field(..., description="Endpoint to poll for task results")
    report_pdf_url: str = Field(..., description="Endpoint to retrieve 2-page executive PDF report")
    report_html_url: str = Field(..., description="Endpoint to retrieve interactive HTML report")


__all__ = [
    "TaskSubmissionResponse",
    "CADProfileResponse",
    "AssemblySummary",
    "ComponentProfile",
    "ComponentClass",
    "ManufacturingProcess",
    "DFMReport",
    "OrientedBoundingBox",
    "BoundingEnvelope",
    "InertiaTensorData",
    "SurfaceType",
    "TaskStatus",
]
