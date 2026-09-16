"""Unit tests for Module A: Dual Ingestion & Topology Parser (core/parser.py)."""

import os
from pathlib import Path
import tempfile
import numpy as np
import pytest
import trimesh
import torch

from core.parser import (
    CADParser,
    furthest_point_sampling,
    compute_cotangent_laplacian,
    compute_mesh_dihedral_angles,
)


@pytest.fixture
def sample_stl_file():
    """Generates a temporary STL file containing a rectangular bracket geometry."""
    with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as f:
        path = f.name

    # Create box with dimensions 50 x 20 x 5 mm
    box = trimesh.creation.box(extents=[50.0, 20.0, 5.0])
    box.export(path)
    yield path
    if os.path.exists(path):
        os.remove(path)


def test_furthest_point_sampling():
    """Verify that FPS samples exactly N points of shape (N, 6) with surface normals."""
    # Create sphere with 1000 vertices
    sphere = trimesh.creation.icosphere(subdivisions=3, radius=10.0)
    pts = sphere.vertices
    normals = sphere.vertex_normals

    n_samples = 512
    fps_cloud = furthest_point_sampling(pts, normals, num_samples=n_samples)

    assert fps_cloud.shape == (n_samples, 6)
    assert np.all(np.isfinite(fps_cloud))

    # Verify sampled coordinates lie near the sphere surface (radius ~ 10)
    radii = np.linalg.norm(fps_cloud[:, :3], axis=1)
    assert np.allclose(radii, 10.0, atol=0.5)

    # Verify normal vectors have unit length
    norm_lens = np.linalg.norm(fps_cloud[:, 3:], axis=1)
    assert np.allclose(norm_lens, 1.0, atol=1e-3)


def test_cotangent_laplacian():
    """Verify cotangent Laplace-Beltrami operator matrix properties."""
    box = trimesh.creation.box(extents=[10.0, 10.0, 10.0])
    L = compute_cotangent_laplacian(box)

    assert L.shape == (len(box.vertices), len(box.vertices))
    # Sum of each row of Laplacian should be 0 (constant eigenvector property)
    row_sums = np.array(L.sum(axis=1)).flatten()
    assert np.allclose(row_sums, 0.0, atol=1e-5)


def test_dihedral_angles():
    """Verify face and vertex dihedral angle calculations."""
    box = trimesh.creation.box(extents=[10.0, 10.0, 10.0])
    face_angles, vert_angles = compute_mesh_dihedral_angles(box)

    assert len(face_angles) > 0
    # For a cube, adjacent faces meet at 90 degrees (pi / 2 rad) or 0 degrees (coplanar triangles on same side)
    assert np.all(face_angles >= 0.0)
    assert np.all(face_angles <= np.pi)


def test_discrete_mesh_ingestion(sample_stl_file):
    """Test end-to-end discrete mesh ingestion via CADParser."""
    parser = CADParser(target_fps_points=1024)
    parsed = parser.parse(sample_stl_file)

    assert parsed.ingestion_path == "discrete_mesh"
    assert parsed.is_watertight is True
    assert parsed.is_manifold is True
    assert parsed.point_cloud_fps.shape == (1024, 6)
    assert parsed.pyg_graph.x is not None
    assert parsed.pyg_graph.edge_index is not None
    assert parsed.pyg_graph.x.shape[0] == len(parsed.mesh.faces)


def test_parser_fallback_corrupt_file():
    """Verify robust fallback behavior when parsing corrupt file to avoid 500 error."""
    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as f:
        f.write(b"CORRUPT_STEP_HEADER_NON_VALID_CAD_DATA")
        path = f.name

    try:
        parser = CADParser()
        parsed = parser.parse(path)
        # Should gracefully return a fallback parsed object instead of raising unhandled exception
        assert parsed is not None
        assert parsed.mesh is not None
        assert len(parsed.mesh.faces) > 0
    finally:
        if os.path.exists(path):
            os.remove(path)
