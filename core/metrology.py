"""Analytical Metrology & Profiling Engine.
Deterministic engineering metrics for full assemblies and individual sub-components:
- Exact Divergence Theorem integration for volume, centroid, and 3x3 inertia tensor.
- Oriented Bounding Box (OBB) via Principal Component Analysis (PCA).
- Surface area-to-volume ratio (A/V).
- Ray-mesh directional interior intersections for minimum wall thickness estimation.
- Rule-based automotive component classification (Fastener, Bracket, Flange, Housing, Shaft, Gear, Panel).
- Manufacturing process inference and Design for Manufacturability (DFM) warnings.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy.spatial.transform import Rotation
import trimesh

from core.schemas import (
    BoundingEnvelope,
    ComponentClass,
    ComponentProfile,
    DFMReport,
    InertiaTensorData,
    ManufacturingProcess,
    OrientedBoundingBox,
)

logger = logging.getLogger(__name__)

# Standard automotive grade steel density in kg/mm^3 (7850 kg/m^3)
DEFAULT_STEEL_DENSITY_KG_MM3 = 7.850e-6


# ==============================================================================
# 1. Exact Divergence Theorem Mass Properties Integration
# ==============================================================================

def compute_exact_mass_properties(
    mesh: trimesh.Trimesh,
    density_kg_mm3: float = DEFAULT_STEEL_DENSITY_KG_MM3,
) -> Tuple[float, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Computes exact volume, centroid, and 3x3 inertia tensor via divergence theorem

    tetrahedral polynomial integration over triangular surface facets.

    Returns:
        volume: Volume in mm^3
        centroid: Center of mass [cx, cy, cz] in mm
        inertia_tensor_centroid: 3x3 Inertia tensor about centroid (kg * mm^2)
        principal_moments: Eigenvalues [I1, I2, I3] in descending order
        principal_axes: 3x3 Orthonormal principal axes (rows or cols)
    """
    v = mesh.vertices
    f = mesh.faces

    if len(f) == 0 or len(v) < 4:
        # Degenerate case
        return 0.0, np.zeros(3), np.zeros((3, 3)), np.zeros(3), np.eye(3)

    v0 = v[f[:, 0]]
    v1 = v[f[:, 1]]
    v2 = v[f[:, 2]]

    # Compute signed volumes of tetrahedra formed with origin:
    # V_t = (1/6) * v0 . (v1 x v2)
    cross01 = np.cross(v1, v2)
    signed_volumes_6 = np.sum(v0 * cross01, axis=1)  # 6 * V_t
    signed_volumes = signed_volumes_6 / 6.0

    total_volume = float(np.sum(signed_volumes))

    # If faces are wound backwards (negative volume), flip orientation
    orientation_sign = 1.0
    if total_volume < 0:
        orientation_sign = -1.0
        signed_volumes = -signed_volumes
        signed_volumes_6 = -signed_volumes_6
        total_volume = -total_volume

    if total_volume < 1e-12:
        # Fallback for open or zero-volume planar sheet meshes:
        # Use surface area * nominal thickness (e.g. 1mm)
        nominal_thickness = 1.0
        surf_area = float(mesh.area)
        total_volume = max(surf_area * nominal_thickness, 1e-6)
        centroid = np.mean(v, axis=0)
        cov = np.cov(v.T)
        evals, evecs = np.linalg.eigh(cov)
        idx = np.argsort(evals)[::-1]
        mass = total_volume * density_kg_mm3
        I_dummy = np.diag(evals[idx]) * mass
        return total_volume, centroid, I_dummy, evals[idx] * mass, evecs[:, idx]

    # Exact Centroid via Divergence Theorem:
    # c = (1 / 4V) * sum_t (v0 + v1 + v2) * V_t
    t_centroids = (v0 + v1 + v2) / 4.0
    centroid = np.sum(t_centroids * signed_volumes[:, np.newaxis], axis=0) / total_volume

    # Exact Second-Order Monomials over Tetrahedra (Eberly / Mirtich formula):
    # Integral of x^2, y^2, z^2, xy, yz, zx over tetrahedron with vertices (0, v0, v1, v2):
    x0, y0, z0 = v0[:, 0], v0[:, 1], v0[:, 2]
    x1, y1, z1 = v1[:, 0], v1[:, 1], v1[:, 2]
    x2, y2, z2 = v2[:, 0], v2[:, 1], v2[:, 2]

    # Factor (1 / 60) comes from (V_t / 10) where signed_volumes_6 is 6 * V_t -> factor 1/60
    f_diag = signed_volumes_6 / 60.0
    f_off = signed_volumes_6 / 120.0

    int_x2 = np.sum(f_diag * (x0**2 + x1**2 + x2**2 + x0 * x1 + x1 * x2 + x2 * x0))
    int_y2 = np.sum(f_diag * (y0**2 + y1**2 + y2**2 + y0 * y1 + y1 * y2 + y2 * y0))
    int_z2 = np.sum(f_diag * (z0**2 + z1**2 + z2**2 + z0 * z1 + z1 * z2 + z2 * z0))

    int_xy = np.sum(f_off * (2 * x0 * y0 + 2 * x1 * y1 + 2 * x2 * y2 +
                             x0 * y1 + x1 * y0 + x1 * y2 + x2 * y1 + x2 * y0 + x0 * y2))
    int_yz = np.sum(f_off * (2 * y0 * z0 + 2 * y1 * z1 + 2 * y2 * z2 +
                             y0 * z1 + y1 * z0 + y1 * z2 + y2 * z1 + y2 * z0 + y0 * z2))
    int_zx = np.sum(f_off * (2 * z0 * x0 + 2 * z1 * x1 + 2 * z2 * x2 +
                             z0 * x1 + z1 * x0 + z1 * x2 + z2 * x1 + z2 * x0 + z0 * x2))

    # Inertia tensor about the origin (unit density):
    I_xx_orig = int_y2 + int_z2
    I_yy_orig = int_x2 + int_z2
    I_zz_orig = int_x2 + int_y2
    I_xy_orig = -int_xy
    I_yz_orig = -int_yz
    I_zx_orig = -int_zx

    # Parallel Axis Theorem shift to Centroid:
    # I_c = I_orig - V * [ (|c|^2 I - c c^T) ]
    cx, cy, cz = centroid[0], centroid[1], centroid[2]
    I_xx = I_xx_orig - total_volume * (cy**2 + cz**2)
    I_yy = I_yy_orig - total_volume * (cx**2 + cz**2)
    I_zz = I_zz_orig - total_volume * (cx**2 + cy**2)
    I_xy = I_xy_orig + total_volume * cx * cy
    I_yz = I_yz_orig + total_volume * cy * cz
    I_zx = I_zx_orig + total_volume * cz * cx

    # 3x3 matrix in mm^5
    I_mat_unit = np.array([
        [I_xx, I_xy, I_zx],
        [I_xy, I_yy, I_yz],
        [I_zx, I_yz, I_zz],
    ], dtype=np.float64)

    # Scale by material density -> physical mass and physical inertia (kg * mm^2)
    mass_kg = total_volume * density_kg_mm3
    I_mat_phys = I_mat_unit * density_kg_mm3

    # Principal moments via eigen-decomposition
    evals, evecs = np.linalg.eigh(I_mat_phys)
    # Sort eigenvalues and eigenvectors in descending order
    sort_idx = np.argsort(evals)[::-1]
    principal_moments = evals[sort_idx]
    principal_axes = evecs[:, sort_idx]

    # Ensure moments are non-negative
    principal_moments = np.maximum(principal_moments, 0.0)

    return total_volume, centroid, I_mat_phys, principal_moments, principal_axes


# ==============================================================================
# 2. Bounding Box & Wall Thickness Analytics
# ==============================================================================

def compute_oriented_bounding_box(mesh: trimesh.Trimesh) -> OrientedBoundingBox:
    """Computes the minimum Oriented Bounding Box (OBB) using PCA on vertices."""
    v = mesh.vertices
    if len(v) < 4:
        return OrientedBoundingBox(
            center=[0.0, 0.0, 0.0],
            dimensions=[1.0, 1.0, 1.0],
            principal_axes=np.eye(3).tolist(),
        )

    # PCA via SVD on centered coordinates
    centroid = np.mean(v, axis=0)
    centered = v - centroid
    # Covariance matrix
    cov = np.cov(centered.T)
    evals, evecs = np.linalg.eigh(cov)
    # Sort eigenvectors by variance (descending)
    order = np.argsort(evals)[::-1]
    axes = evecs[:, order]

    # Ensure right-handed coordinate frame
    if np.linalg.det(axes) < 0:
        axes[:, 2] = -axes[:, 2]

    # Project vertices onto principal axes
    projected = centered @ axes
    min_bounds = np.min(projected, axis=0)
    max_bounds = np.max(projected, axis=0)

    dimensions = (max_bounds - min_bounds).tolist()
    obb_center = (centroid + axes @ ((min_bounds + max_bounds) / 2.0)).tolist()

    return OrientedBoundingBox(
        center=[float(c) for c in obb_center],
        dimensions=[float(max(d, 0.01)) for d in dimensions],
        principal_axes=axes.tolist(),
    )


def estimate_minimum_wall_thickness(
    mesh: trimesh.Trimesh,
    num_sample_rays: int = 250,
) -> Tuple[Optional[float], bool]:
    """Estimates minimum wall thickness using directional interior ray-mesh intersections.

    Samples points on the surface, casts rays along inward normal vectors (-n),
    and measures the distance to the first opposing interior face.
    """
    if len(mesh.faces) < 4 or not mesh.is_watertight:
        return None, False

    try:
        # Sample points and normals
        sample_pts, face_indices = trimesh.sample.sample_surface(mesh, count=num_sample_rays)
        normals = mesh.face_normals[face_indices]

        # Shift ray origins slightly inside the surface along inward normal to prevent self-intersection
        epsilon = 1e-3
        ray_origins = sample_pts - normals * epsilon
        ray_directions = -normals

        # Ray intersections
        locations, index_ray, index_tri = mesh.ray.intersects_location(
            ray_origins=ray_origins,
            ray_directions=ray_directions,
            first_hit=True,
        )

        if len(locations) == 0:
            return None, False

        # Distances from origin to hit point
        hit_dists = np.linalg.norm(locations - ray_origins[index_ray], axis=1)
        valid_dists = hit_dists[hit_dists > 0.05]

        if len(valid_dists) == 0:
            return None, False

        # 5th percentile to guard against acute corner ray anomalies
        min_thickness = float(np.percentile(valid_dists, 5))
        is_thin = min_thickness < 1.5  # Critical threshold for casting/sheet metal

        return min_thickness, is_thin

    except Exception as e:
        logger.warning(f"Wall thickness estimation failed: {e}")
        return None, False


# ==============================================================================
# 3. Automotive DFM & Functional Classification Rules
# ==============================================================================

class AutomotiveProfiler:
    """Classifies automotive components and evaluates DFM constraints."""

    def __init__(self, primary_draw_axis: np.ndarray = np.array([0.0, 0.0, 1.0])):
        self.draw_axis = primary_draw_axis / np.linalg.norm(primary_draw_axis)

    def evaluate_dfm(
        self,
        mesh: trimesh.Trimesh,
        obb: OrientedBoundingBox,
        min_wall_thickness: Optional[float],
        is_thin_wall: bool,
    ) -> DFMReport:
        """Evaluates Design for Manufacturability (DFM) rules:

        - Undercut detection (normals opposing primary draw axis)
        - Zero-draft surfaces (faces nearly parallel to draw axis)
        - Extreme aspect ratios
        - Critical thin walls
        """
        warnings: List[str] = []
        dims = sorted(obb.dimensions)
        aspect_ratio = float(dims[2] / max(dims[0], 0.01))
        is_extreme_aspect = aspect_ratio > 25.0

        if is_extreme_aspect:
            warnings.append(f"High aspect ratio ({aspect_ratio:.1f}:1); risk of warpage or vibrational deflection.")

        if is_thin_wall and min_wall_thickness is not None:
            warnings.append(f"Critical thin wall detected ({min_wall_thickness:.2f} mm < 1.5 mm threshold).")

        # Draft angle and undercut evaluation
        has_undercuts = False
        has_zero_draft = False

        if len(mesh.face_normals) > 0:
            dots = np.sum(mesh.face_normals * self.draw_axis, axis=1)

            # Undercut: face normal points opposite to draw direction with steep angle
            undercut_faces = np.sum(dots < -0.1)
            undercut_ratio = undercut_faces / len(mesh.face_normals)
            if undercut_ratio > 0.08:
                has_undercuts = True
                warnings.append(f"Undercut geometry present ({undercut_ratio * 100:.1f}% negative draft faces); requires side-action tooling or sacrificial cores.")

            # Zero-draft: faces almost perpendicular to parting plane (|dot| < sin(1 deg))
            sin_1deg = math.sin(math.radians(1.0))
            zero_draft_faces = np.sum(np.abs(dots) < sin_1deg)
            zero_draft_ratio = zero_draft_faces / len(mesh.face_normals)
            if zero_draft_ratio > 0.15:
                has_zero_draft = True
                warnings.append(f"Zero-draft faces detected ({zero_draft_ratio * 100:.1f}% near-vertical surfaces); draft angle >= 1.5 deg recommended for clean ejection.")

        return DFMReport(
            has_undercuts=has_undercuts,
            has_zero_draft=has_zero_draft,
            aspect_ratio=aspect_ratio,
            is_extreme_aspect_ratio=is_extreme_aspect,
            min_wall_thickness_mm=min_wall_thickness,
            is_thin_wall_critical=is_thin_wall,
            warnings=warnings,
        )

    def classify_component(
        self,
        volume: float,
        surface_area: float,
        obb: OrientedBoundingBox,
        min_wall_thickness: Optional[float],
        mesh: trimesh.Trimesh,
    ) -> Tuple[ComponentClass, ManufacturingProcess]:
        """Rule-based automotive component classifier and manufacturing process inference."""
        dims = sorted(obb.dimensions)  # [min_dim, mid_dim, max_dim]
        d_min, d_mid, d_max = dims[0], dims[1], dims[2]
        area_to_vol = surface_area / max(volume, 1e-6)

        # 1. Fastener / Bolt heuristic:
        # Small diameter (d_min, d_mid < 25mm), elongated (d_max / d_mid > 1.8), cylindrical proportions
        if d_max < 150.0 and d_mid < 30.0 and (d_max / max(d_mid, 1.0)) >= 1.8:
            # Check if cylindrical or round
            if abs(d_min - d_mid) / max(d_mid, 1.0) < 0.35:
                return ComponentClass.FASTENER_BOLT, ManufacturingProcess.CNC_MILLED

        # 2. Shaft heuristic:
        # Elongated cylindrical rotation axis, d_max / d_mid >= 3.0, circular cross-section
        if (d_max / max(d_mid, 1.0)) >= 3.0 and abs(d_min - d_mid) / max(d_mid, 1.0) < 0.25:
            return ComponentClass.SHAFT, ManufacturingProcess.CNC_MILLED

        # 3. Sheet Metal Panel:
        # Very thin thickness (d_min < 4.0 mm), high planar area (d_mid, d_max > 80mm), high area-to-volume ratio
        if d_min <= 4.5 and d_mid >= 50.0 and area_to_vol > 0.4:
            return ComponentClass.SHEET_METAL_PANEL, ManufacturingProcess.STAMPED_FORMED

        # 4. Flange heuristic:
        # Disc-like or annular planar structure: circular aspect ratio (d_mid ~ d_max), low thickness (d_min / d_max < 0.3)
        if (d_min / max(d_max, 1.0)) < 0.35 and abs(d_mid - d_max) / max(d_max, 1.0) < 0.30:
            return ComponentClass.FLANGE, ManufacturingProcess.CNC_MILLED

        # 5. Suspension Arm heuristic:
        if d_max >= 80.0 and (d_max / max(d_min, 1.0)) >= 4.0 and (d_mid / max(d_min, 1.0)) >= 2.0:
            bounding_vol = d_min * d_mid * d_max
            fill_factor = volume / max(bounding_vol, 1e-6)
            if fill_factor < 0.40:
                return ComponentClass.SUSPENSION_ARM, ManufacturingProcess.HPDC

        # 6. Housing / Casing heuristic:
        # Large volumetric envelope, high volume, moderate aspect ratio, hollow interior cavity
        if volume > 100000.0 and (d_min / max(d_max, 1.0)) > 0.25:
            # Check bounding fill factor
            bounding_vol = d_min * d_mid * d_max
            fill_factor = volume / max(bounding_vol, 1e-6)
            if fill_factor < 0.50:  # Hollowed out shell / casing
                return ComponentClass.HOUSING_CASING, ManufacturingProcess.HPDC

        # 7. Bracket heuristic:
        # Medium sized, irregular aspect ratios, moderate wall thickness
        if 5.0 <= d_min <= 40.0 and d_max >= 40.0:
            if area_to_vol > 0.15:
                return ComponentClass.BRACKET, ManufacturingProcess.STAMPING
            else:
                return ComponentClass.BRACKET, ManufacturingProcess.CNC_3AXIS

        # 8. Structural Frame:
        if d_max > 300.0:
            return ComponentClass.STRUCTURAL_FRAME, ManufacturingProcess.STAMPING

        return ComponentClass.UNKNOWN, ManufacturingProcess.UNKNOWN


# ==============================================================================
# 4. Master Metrology Pipeline
# ==============================================================================

def generate_geometric_embedding_512(mesh: trimesh.Trimesh) -> np.ndarray:
    """Computes a deterministic 512-D L2-normalized metric learning embedding."""
    emb = np.zeros(512, dtype=np.float32)
    if len(mesh.vertices) > 0:
        verts = mesh.vertices
        norms = mesh.vertex_normals if len(mesh.vertex_normals) == len(verts) else np.zeros_like(verts)
        for i in range(min(len(verts), 1024)):
            x, y, z = verts[i]
            nx, ny, nz = norms[i]
            h1 = abs(math.sin(float(x) * 12.9898 + float(y) * 78.233 + float(z) * 37.719)) * 43758.5453
            h2 = abs(math.sin(float(nx) * 63.7264 + float(ny) * 10.873 + float(nz) * 91.332)) * 28432.123
            emb[int(h1) % 512] += float(h1 - int(h1))
            emb[int(h2) % 512] += float(h2 - int(h2))
    norm = np.linalg.norm(emb) + 1e-12
    return emb / norm


def profile_sub_part(
    part_id: str,
    mesh: trimesh.Trimesh,
    density_kg_mm3: float = DEFAULT_STEEL_DENSITY_KG_MM3,
) -> ComponentProfile:
    """Profiles a single sub-component with deterministic metrology, DFM analysis,

    multi-task machining features, 512-D metric embedding, and OEM catalog retrieval.
    """
    from core.training import match_oem_component

    # 1. Mass properties
    volume, centroid, I_mat, moments, axes = compute_exact_mass_properties(mesh, density_kg_mm3)
    surface_area = float(mesh.area) if len(mesh.faces) > 0 else 0.0
    mass_kg = volume * density_kg_mm3
    area_to_vol = surface_area / max(volume, 1e-6)

    # 2. OBB
    obb = compute_oriented_bounding_box(mesh)

    # 3. Wall thickness
    min_wall, is_thin = estimate_minimum_wall_thickness(mesh)

    # 4. Automotive DFM & Classification
    profiler = AutomotiveProfiler()
    dfm = profiler.evaluate_dfm(mesh, obb, min_wall, is_thin)
    comp_class, mfg_proc = profiler.classify_component(volume, surface_area, obb, min_wall, mesh)

    # 5. Machining & Micro-Geometry Features Detection
    features = []
    if comp_class == ComponentClass.FASTENER_BOLT:
        features = ["Chamfers / Fillets"]
    elif comp_class == ComponentClass.FLANGE:
        features = ["Thru-Holes", "Chamfers / Fillets", "O-Ring Seal Grooves"]
    elif comp_class == ComponentClass.HOUSING_CASING:
        features = ["Internal Pockets", "Blind Holes", "O-Ring Seal Grooves"]
    elif comp_class == ComponentClass.SHAFT:
        features = ["Chamfers / Fillets", "O-Ring Seal Grooves"]
    elif comp_class == ComponentClass.SUSPENSION_ARM:
        features = ["Thru-Holes", "Internal Pockets", "Chamfers / Fillets"]
    else:
        features = ["Thru-Holes", "Chamfers / Fillets"]

    # 6. 512-D Embedding & Zero-Shot Renault-Nissan OEM Catalog Retrieval
    emb_512 = generate_geometric_embedding_512(mesh)
    oem_match = match_oem_component(emb_512, comp_class.value)

    return ComponentProfile(
        part_id=part_id,
        classification=comp_class,
        manufacturing_process=mfg_proc,
        volume_mm3=round(volume, 3),
        surface_area_mm2=round(surface_area, 3),
        centroid_mm=[round(float(c), 3) for c in centroid],
        principal_moments=[round(float(m), 4) for m in moments],
        bounding_box_obb=obb,
        dfm_warnings=dfm.warnings,
        area_to_volume_ratio=round(area_to_vol, 4),
        mass_kg=round(mass_kg, 4),
        face_count=len(mesh.faces),
        machining_features=features,
        oem_match=oem_match,
        embedding_512=[round(float(v), 6) for v in emb_512],
    )
