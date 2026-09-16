"""Celery Tasks and Pipeline Orchestration for AutoCAD-Profiler.
Handles asynchronous and synchronous execution of CAD ingestion, decomposition,
metrology profiling, and engineering report generation.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
import time
from typing import Any, Dict, List, Optional

from celery import Celery
import numpy as np
import trimesh

from core.parser import CADParser, ParsedCAD
from core.segmentation import DecompositionEngine
from core.metrology import compute_exact_mass_properties, profile_sub_part
from core.reporter import ReportGenerator
from core.schemas import (
    AssemblySummary,
    BoundingEnvelope,
    CADProfileResponse,
    ComponentProfile,
    TaskStatus,
)

logger = logging.getLogger(__name__)

# Celery Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
celery_app = Celery(
    "autocad_profiler",
    broker=REDIS_URL,
    backend=REDIS_URL,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    broker_connection_retry_on_startup=False,
    broker_connection_max_retries=1,
    broker_connection_timeout=0.5,
    redis_socket_connect_timeout=0.5,
    redis_socket_timeout=0.5,
)


# In-memory / file-backed cache for task results and reports (enables standalone operation without Redis)
REPORTS_DIR = Path(os.getenv("REPORTS_DIR", "./reports_cache"))
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
_LOCAL_TASK_CACHE: Dict[str, CADProfileResponse] = {}


def execute_pipeline(task_id: str, file_path: str, original_filename: str) -> CADProfileResponse:
    """Core synchronous pipeline orchestrating parsing, decomposition, metrology, and reporting."""
    start_time = time.perf_counter()
    logger.info(f"Starting CAD profiling pipeline for task {task_id} on {original_filename}")

    try:
        # Step 1: Parse CAD file (Parametric B-Rep or Discrete Mesh with robust fallback)
        parser = CADParser(target_fps_points=2048)
        parsed: ParsedCAD = parser.parse(file_path)

        # Step 2: Decompose merged solid into sub-components
        decomposer = DecompositionEngine(
            sigma_n=0.35,
            sigma_s=50.0,
            concave_angle_deg=165.0,
        )
        partitions = decomposer.segment(
            mesh=parsed.mesh,
            brep_face_attrs=parsed.face_attributes,
            brep_edge_attrs=parsed.edge_attributes,
        )

        # Step 3: Analytical Metrology on every sub-part
        components: List[ComponentProfile] = []
        for part in partitions:
            comp_profile = profile_sub_part(
                part_id=part.part_id,
                mesh=part.mesh,
            )
            components.append(comp_profile)

        # Step 4: Overall Assembly Summary
        bounds = parsed.mesh.bounds
        if bounds is not None and len(bounds) == 2:
            min_pt = [float(x) for x in bounds[0]]
            max_pt = [float(x) for x in bounds[1]]
            dims = [float(max(max_pt[i] - min_pt[i], 0.01)) for i in range(3)]
        else:
            min_pt, max_pt, dims = [0.0, 0.0, 0.0], [10.0, 10.0, 10.0], [10.0, 10.0, 10.0]

        total_vol, assembly_com, _, _, _ = compute_exact_mass_properties(parsed.mesh)
        total_mass = sum(c.mass_kg for c in components)
        total_area = sum(c.surface_area_mm2 for c in components)

        summary = AssemblySummary(
            total_parts_detected=len(components),
            total_bounding_envelope=BoundingEnvelope(
                min_pt=min_pt,
                max_pt=max_pt,
                dimensions=dims,
            ),
            overall_center_of_mass=[round(float(c), 3) for c in assembly_com],
            total_mass_kg=round(float(total_mass), 4),
            total_volume_mm3=round(float(total_vol), 3),
            total_surface_area_mm2=round(float(total_area), 3),
        )

        exec_duration = time.perf_counter() - start_time
        response = CADProfileResponse(
            task_id=task_id,
            status=TaskStatus.SUCCESS,
            filename=original_filename,
            ingestion_path=parsed.ingestion_path,
            assembly_summary=summary,
            components=components,
            execution_time_seconds=round(exec_duration, 4),
        )

        # Pre-cache PDF and HTML reports
        pdf_path = REPORTS_DIR / f"{task_id}.pdf"
        html_path = REPORTS_DIR / f"{task_id}.html"
        ReportGenerator.generate_pdf_report(response, str(pdf_path))
        html_content = ReportGenerator.generate_html_report(response)
        html_path.write_text(html_content, encoding="utf-8")

        # Save to local cache
        _LOCAL_TASK_CACHE[task_id] = response
        return response

    except Exception as e:
        exec_duration = time.perf_counter() - start_time
        logger.error(f"Pipeline failure for task {task_id}: {e}", exc_info=True)
        fail_response = CADProfileResponse(
            task_id=task_id,
            status=TaskStatus.FAILURE,
            filename=original_filename,
            ingestion_path="failed",
            execution_time_seconds=round(exec_duration, 4),
            error=str(e),
        )
        _LOCAL_TASK_CACHE[task_id] = fail_response
        return fail_response


@celery_app.task(name="process_cad_task", bind=True)
def process_cad_task(self, file_path: str, original_filename: str) -> Dict[str, Any]:
    """Celery worker task entry point."""
    task_id = self.request.id or f"task_{int(time.time() * 1000)}"
    result = execute_pipeline(task_id, file_path, original_filename)
    return result.model_dump()


def get_task_result(task_id: str) -> Optional[CADProfileResponse]:
    """Retrieves task result from local cache or Celery backend."""
    if task_id in _LOCAL_TASK_CACHE:
        return _LOCAL_TASK_CACHE[task_id]

    try:
        async_res = celery_app.AsyncResult(task_id)
        if async_res.ready():
            data = async_res.get()
            if isinstance(data, dict):
                resp = CADProfileResponse.model_validate(data)
                _LOCAL_TASK_CACHE[task_id] = resp
                return resp
    except Exception as e:
        logger.debug(f"Could not poll Celery async result for {task_id}: {e}")

    return None
