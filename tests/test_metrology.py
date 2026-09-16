"""Unit tests for Module C: Analytical Metrology & Profiling Engine (core/metrology.py)."""

import math
import numpy as np
import pytest
import trimesh

from core.metrology import (
    AutomotiveProfiler,
    compute_exact_mass_properties,
    compute_oriented_bounding_box,
    estimate_minimum_wall_thickness,
    profile_sub_part,
)
from core.schemas import ComponentClass, ManufacturingProcess


def test_divergence_theorem_volume_and_centroid_cube():
    """Verify divergence theorem integration on a 20 x 20 x 20 cube."""
    cube = trimesh.creation.box(extents=[20.0, 20.0, 20.0])
    # Shift cube so center of mass is at (10, 20, 30)
    cube.apply_translation([10.0, 20.0, 30.0])

    vol, com, I_mat, moments, axes = compute_exact_mass_properties(cube)

    # Theoretical volume: 20^3 = 8000.0 mm^3
    assert np.isclose(vol, 8000.0, rtol=1e-3)
    # Theoretical centroid: (10, 20, 30)
    assert np.allclose(com, [10.0, 20.0, 30.0], atol=1e-2)

    # Moments of inertia around centroid for cube of side a=20:
    # Mass = 8000 * 7.85e-6 = 0.0628 kg
    # I_xx = I_yy = I_zz = (1/6) * M * a^2 = (1/6) * 0.0628 * 400 = 4.18667 kg*mm^2
    theoretical_moment = (1.0 / 6.0) * (8000.0 * 7.85e-6) * (20.0 ** 2)
    assert np.allclose(moments, theoretical_moment, rtol=1e-2)


def test_divergence_theorem_volume_cylinder():
    """Verify divergence theorem volume calculation on a cylinder."""
    radius = 10.0
    height = 50.0
    cylinder = trimesh.creation.cylinder(radius=radius, height=height, sections=64)

    vol, com, I_mat, moments, axes = compute_exact_mass_properties(cylinder)

    theoretical_vol = math.pi * (radius ** 2) * height
    # With 64 polygonal sections, volume is within 0.5%
    assert np.isclose(vol, theoretical_vol, rtol=5e-3)


def test_oriented_bounding_box_pca():
    """Verify PCA OBB accurately recovers oriented dimensions under arbitrary 3D rotation."""
    # Create elongated rectangular block: 100 x 30 x 10 mm
    block = trimesh.creation.box(extents=[100.0, 30.0, 10.0])

    # Apply 45-degree rotation around Z axis
    rot_mat = trimesh.transformations.rotation_matrix(np.radians(45.0), [0, 0, 1])
    block.apply_transform(rot_mat)

    obb = compute_oriented_bounding_box(block)
    dims = sorted(obb.dimensions)

    # Should recover ~10, ~30, ~100
    assert np.isclose(dims[0], 10.0, atol=1.0)
    assert np.isclose(dims[1], 30.0, atol=1.0)
    assert np.isclose(dims[2], 100.0, atol=1.0)


def test_minimum_wall_thickness():
    """Verify minimum wall thickness estimation using interior ray intersections."""
    # Box of thickness 4.0 mm
    sheet = trimesh.creation.box(extents=[50.0, 50.0, 4.0])
    min_wall, is_thin = estimate_minimum_wall_thickness(sheet)

    assert min_wall is not None
    # Estimated wall thickness should be close to 4.0 mm
    assert np.isclose(min_wall, 4.0, atol=0.2)
    assert is_thin is False


def test_automotive_component_classification():
    """Test heuristic classification rules on representative automotive geometries."""
    # 1. Fastener / Bolt: M8 x 40mm cylindrical pin
    bolt = trimesh.creation.cylinder(radius=4.0, height=40.0)
    profile_bolt = profile_sub_part("BOLT_01", bolt)
    assert profile_bolt.classification in [ComponentClass.FASTENER_BOLT, ComponentClass.SHAFT]

    # 2. Sheet Metal Panel: 100 x 100 x 1.5 mm thin panel
    panel = trimesh.creation.box(extents=[100.0, 100.0, 1.5])
    profile_panel = profile_sub_part("PANEL_01", panel)
    assert profile_panel.classification == ComponentClass.SHEET_METAL_PANEL
    assert profile_panel.manufacturing_process == ManufacturingProcess.STAMPED_FORMED

    # 3. Flange: Circular disc 80mm diameter, 10mm thickness
    flange = trimesh.creation.cylinder(radius=40.0, height=10.0)
    profile_flange = profile_sub_part("FLANGE_01", flange)
    assert profile_flange.classification == ComponentClass.FLANGE


def test_dfm_warnings_evaluation():
    """Test DFM warnings for zero-draft and undercuts."""
    # Cube with vertical faces will trigger zero-draft warning
    cube = trimesh.creation.box(extents=[20, 20, 20])
    profile_cube = profile_sub_part("CUBE_01", cube)

    assert len(profile_cube.dfm_warnings) > 0
    warning_text = " ".join(profile_cube.dfm_warnings)
    assert "draft" in warning_text.lower() or "undercut" in warning_text.lower()
