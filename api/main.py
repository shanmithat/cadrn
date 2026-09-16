"""AutoCAD-Profiler FastAPI Microservice.
Provides endpoints for CAD upload, asynchronous job dispatch, profiling status polling,
and WeasyPrint engineering PDF report downloads.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
import shutil
import uuid
from typing import Optional

from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from api.schemas import CADProfileResponse, TaskStatus, TaskSubmissionResponse
from api.tasks import (
    REPORTS_DIR,
    execute_pipeline,
    get_task_result,
    process_cad_task,
)
from core.parser import HAS_OCC

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("autocad_profiler.api")

app = FastAPI(
    title="AutoCAD-Profiler API",
    description="Renault Nissan Automotive CAD Profiling, Segmentation, and Analytics Microservice",
    version="2.0.0",
)

# CORS middleware for automotive dashboard integrations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads_cache"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SUPPORTED_EXTENSIONS = {".step", ".stp", ".iges", ".igs", ".stl", ".obj", ".ply", ".off"}


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
async def health_check():
    """Health check and tech-stack diagnostics endpoint."""
    return {
        "service": "AutoCAD-Profiler",
        "status": "OPERATIONAL",
        "version": "2.0.0",
        "pythonocc_available": HAS_OCC,
        "target_client": "Renault Nissan Automotive R&D",
        "supported_formats": sorted(list(SUPPORTED_EXTENSIONS)),
    }


@app.post(
    "/api/v1/profile",
    response_model=TaskSubmissionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["CAD Profiling"],
    summary="Upload CAD file for profiling & decomposition",
)
async def submit_cad_profile(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Raw 3D CAD file (.step, .stp, .iges, .igs, .stl, .obj)"),
):
    """Ingests raw 3D CAD files (STEP, IGES, STL, OBJ) and dispatches an asynchronous

    profiling, segmentation, and metrology task.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename.",
        )

    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file format '{ext}'. Supported: {sorted(list(SUPPORTED_EXTENSIONS))}",
        )

    task_id = str(uuid.uuid4())
    temp_file_path = UPLOAD_DIR / f"{task_id}_{file.filename}"

    try:
        with temp_file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error(f"Failed to save upload {file.filename}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist uploaded CAD file.",
        )

    # Celery vs BackgroundTasks orchestration
    enable_celery = os.getenv("ENABLE_CELERY", "0").lower() in ["1", "true", "yes"]
    dispatched_to_celery = False

    if enable_celery:
        try:
            process_cad_task.apply_async(args=[str(temp_file_path), file.filename], task_id=task_id)
            dispatched_to_celery = True
            logger.info(f"Task {task_id} successfully queued to Celery broker.")
        except Exception as e:
            logger.warning(f"Celery broker unavailable ({e}); falling back to background worker.")

    if not dispatched_to_celery:
        background_tasks.add_task(execute_pipeline, task_id, str(temp_file_path), file.filename)

    return TaskSubmissionResponse(
        task_id=task_id,
        filename=file.filename,
        status=TaskStatus.PENDING if dispatched_to_celery else TaskStatus.PROCESSING,
        message="CAD model accepted for decomposition and analytical metrology profiling.",
        status_url=f"/api/v1/profile/{task_id}",
        report_pdf_url=f"/api/v1/profile/{task_id}/report.pdf",
        report_html_url=f"/api/v1/profile/{task_id}/report.html",
    )



@app.get(
    "/api/v1/profile/{task_id}",
    response_model=CADProfileResponse,
    tags=["CAD Profiling"],
    summary="Get CAD profiling and segmentation results",
)
async def get_profile_status(task_id: str):
    """Retrieves full assembly summary and component decomposition payload for a task."""
    result = get_task_result(task_id)

    if result is None:
        # Check if task is still pending in Celery
        try:
            from api.tasks import celery_app
            async_res = celery_app.AsyncResult(task_id)
            if async_res.status in ["PENDING", "RECEIVED", "STARTED"]:
                return CADProfileResponse(
                    task_id=task_id,
                    status=TaskStatus.PROCESSING,
                    filename="processing...",
                    ingestion_path="pending",
                )
        except Exception:
            pass

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task '{task_id}' not found or has expired.",
        )

    return result


@app.get(
    "/api/v1/profile/{task_id}/report.pdf",
    tags=["Reporting"],
    summary="Download 2-page executive WeasyPrint PDF report",
)
async def get_pdf_report(task_id: str):
    """Downloads the generated 2-page automotive engineering PDF report."""
    pdf_path = REPORTS_DIR / f"{task_id}.pdf"
    if pdf_path.exists():
        return FileResponse(
            path=str(pdf_path),
            media_type="application/pdf",
            filename=f"{task_id}_RenaultNissan_Engineering_Report.pdf",
        )

    # If PDF is not yet saved, check if task is finished
    result = get_task_result(task_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report for task '{task_id}' not found.",
        )

    from core.reporter import ReportGenerator
    pdf_bytes = ReportGenerator.generate_pdf_report(result, str(pdf_path))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{task_id}_Engineering_Report.pdf"'},
    )


@app.get(
    "/api/v1/profile/{task_id}/report.html",
    response_class=HTMLResponse,
    tags=["Reporting"],
    summary="View interactive HTML engineering report",
)
async def get_html_report(task_id: str):
    """Renders the executive HTML engineering report in browser."""
    html_path = REPORTS_DIR / f"{task_id}.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))

    result = get_task_result(task_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report for task '{task_id}' not found.",
        )

    from core.reporter import ReportGenerator
    html_content = ReportGenerator.generate_html_report(result)
    html_path.write_text(html_content, encoding="utf-8")
    return HTMLResponse(content=html_content)
