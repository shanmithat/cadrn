"""Unit and integration tests for FastAPI Microservice (api/main.py)."""

import io
import tempfile
from fastapi.testclient import TestClient
import pytest
import trimesh

from api.main import app
from core.schemas import TaskStatus

client = TestClient(app)


def test_health_check():
    """Verify health and diagnostics endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "AutoCAD-Profiler"
    assert data["status"] == "OPERATIONAL"
    assert "target_client" in data


def test_submit_cad_profile_stl():
    """Test CAD upload, processing, and retrieval of metrology payload."""
    # Create an in-memory STL file
    box = trimesh.creation.box(extents=[30.0, 15.0, 5.0])
    stl_bytes = box.export(file_type="stl")

    files = {"file": ("bracket_sample.stl", io.BytesIO(stl_bytes), "application/sla")}
    res_upload = client.post("/api/v1/profile", files=files)

    assert res_upload.status_code == 202
    data_upload = res_upload.json()
    task_id = data_upload["task_id"]
    assert "status_url" in data_upload

    # Poll status endpoint
    res_status = client.get(f"/api/v1/profile/{task_id}")
    assert res_status.status_code == 200
    profile_data = res_status.json()

    assert profile_data["task_id"] == task_id
    assert profile_data["status"] == TaskStatus.SUCCESS
    assert profile_data["assembly_summary"] is not None
    assert profile_data["assembly_summary"]["total_parts_detected"] >= 1
    assert len(profile_data["components"]) >= 1

    # Verify component schema compliance
    comp = profile_data["components"][0]
    assert "part_id" in comp
    assert "volume_mm3" in comp
    assert "surface_area_mm2" in comp
    assert "centroid_mm" in comp
    assert "principal_moments" in comp
    assert "bounding_box_obb" in comp

    # Verify PDF report retrieval
    res_pdf = client.get(f"/api/v1/profile/{task_id}/report.pdf")
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert len(res_pdf.content) > 1000

    # Verify HTML report retrieval
    res_html = client.get(f"/api/v1/profile/{task_id}/report.html")
    assert res_html.status_code == 200
    assert "text/html" in res_html.headers["content-type"]
    assert "AutoCAD-Profiler" in res_html.text


def test_invalid_file_extension():
    """Verify rejection of unsupported file extensions with 415."""
    fake_file = io.BytesIO(b"fake txt content")
    files = {"file": ("geometry.txt", fake_file, "text/plain")}
    response = client.post("/api/v1/profile", files=files)
    assert response.status_code == 415
    assert "Unsupported file format" in response.json()["detail"]


def test_nonexistent_task_id():
    """Verify 404 on nonexistent task query."""
    response = client.get("/api/v1/profile/nonexistent-uuid-12345")
    assert response.status_code == 404
