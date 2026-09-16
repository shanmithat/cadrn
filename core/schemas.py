"""Strict Pydantic v2 schemas for CAD profiling, decomposition, and analytical metrology.
Tailored for Renault Nissan automotive R&D delivery.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class ComponentClass(str, Enum):
    FASTENER_BOLT = "Fastener/Bolt"
    BRACKET = "Bracket"
    FLANGE = "Flange"
    HOUSING_CASING = "Housing/Casing"
    SHAFT = "Shaft"
    GEAR = "Gear"
    SHEET_METAL_PANEL = "Sheet Metal Panel"
    SUSPENSION_ARM = "Suspension Arm"
    STRUCTURAL_FRAME = "Structural Frame"
    UNKNOWN = "Unknown / Custom Component"


class ManufacturingProcess(str, Enum):
    HPDC = "High-Pressure Die Casting (HPDC)"
    CNC_3AXIS = "3-Axis CNC Milled"
    CNC_5AXIS = "5-Axis CNC Milled"
    STAMPING = "Sheet Metal Stamping"
    ADDITIVE = "Additive Manufacturing"
    INJECTION_MOLDED = "Injection Molded"
    UNKNOWN = "Unknown / Undetermined"
    # Backward-compatible aliases
    STAMPED_FORMED = "Sheet Metal Stamping"
    CNC_MILLED = "3-Axis CNC Milled"
    HIGH_PRESSURE_DIE_CAST = "High-Pressure Die Casting (HPDC)"


class MachiningFeature(str, Enum):
    THRU_HOLES = "Thru-Holes"
    BLIND_HOLES = "Blind Holes"
    POCKETS = "Internal Pockets"
    CHAMFERS = "Chamfers / Fillets"
    O_RING_GROOVES = "O-Ring Seal Grooves"


class OEMPartMatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    part_number: str = Field(..., description="Standard Renault-Nissan OEM Part Number")
    description: str = Field(..., description="Engineering component specification")
    primary_class: str = Field(..., description="Component class")
    process: str = Field(..., description="Manufacturing process")
    catalog_bom: str = Field(..., description="Platform BOM vehicle allocation")
    similarity_score: float = Field(..., description="Cosine similarity confidence percentage")


class SurfaceType(str, Enum):
    PLANE = "Plane"
    CYLINDER = "Cylinder"
    CONE = "Cone"
    SPHERE = "Sphere"
    TORUS = "Torus"
    BEZIER = "BezierSurface"
    BSPLINE = "BSplineSurface"
    REVOLUTION = "SurfaceOfRevolution"
    EXTRUSION = "SurfaceOfExtrusion"
    OFFSET = "OffsetSurface"
    OTHER = "Other"


class BoundingEnvelope(BaseModel):
    model_config = ConfigDict(extra="ignore")
    min_pt: List[float] = Field(..., description="Min [x, y, z] in mm", min_length=3, max_length=3)
    max_pt: List[float] = Field(..., description="Max [x, y, z] in mm", min_length=3, max_length=3)
    dimensions: List[float] = Field(..., description="Box dimensions [dx, dy, dz] in mm", min_length=3, max_length=3)


class OrientedBoundingBox(BaseModel):
    model_config = ConfigDict(extra="ignore")
    center: List[float] = Field(..., description="OBB centroid [x, y, z] in mm", min_length=3, max_length=3)
    dimensions: List[float] = Field(..., description="OBB dimensions [Length, Width, Height] in mm", min_length=3, max_length=3)
    principal_axes: List[List[float]] = Field(
        ...,
        description="3x3 orthonormal rotation matrix specifying OBB orientation",
    )


class InertiaTensorData(BaseModel):
    model_config = ConfigDict(extra="ignore")
    matrix_3x3: List[List[float]] = Field(
        ...,
        description="3x3 Inertia tensor at centroid in mm^5 or kg*mm^2",
    )
    principal_moments: List[float] = Field(
        ...,
        description="Eigenvalues of inertia tensor [I1, I2, I3] in descending order",
        min_length=3,
        max_length=3,
    )
    principal_axes: List[List[float]] = Field(
        ...,
        description="Principal axes of inertia as 3 orthonormal unit vectors",
    )


class DFMReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    has_undercuts: bool = Field(False, description="Flag indicating presence of undercut geometry")
    has_zero_draft: bool = Field(False, description="Flag indicating zero-draft vertical faces")
    aspect_ratio: float = Field(..., description="Bounding aspect ratio (max dimension / min dimension)")
    is_extreme_aspect_ratio: bool = Field(False, description="Aspect ratio > 25.0")
    min_wall_thickness_mm: Optional[float] = Field(None, description="Estimated minimum wall thickness in mm")
    is_thin_wall_critical: bool = Field(False, description="Wall thickness below manufacturing safety threshold")
    warnings: List[str] = Field(default_factory=list, description="Descriptive DFM warning messages")


class ComponentProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    part_id: str = Field(..., description="Unique sub-part identifier (e.g. PART_001)")
    classification: ComponentClass = Field(..., description="Predicted automotive component classification")
    manufacturing_process: ManufacturingProcess = Field(..., description="Inferred probable manufacturing process")
    volume_mm3: float = Field(..., description="Deterministic volume computed via Divergence Theorem integration")
    surface_area_mm2: float = Field(..., description="Exact total surface area in mm^2")
    centroid_mm: List[float] = Field(..., description="Center of Mass [x, y, z] in mm", min_length=3, max_length=3)
    principal_moments: List[float] = Field(
        ...,
        description="Principal moments of inertia [I1, I2, I3] around centroid",
        min_length=3,
        max_length=3,
    )
    bounding_box_obb: OrientedBoundingBox = Field(..., description="Oriented Bounding Box from PCA alignment")
    dfm_warnings: List[str] = Field(default_factory=list, description="Automotive DFM rule validation warnings")
    area_to_volume_ratio: float = Field(..., description="Surface area / volume ratio (mm^-1)")
    mass_kg: float = Field(..., description="Mass assuming standard steel density 7850 kg/m^3")
    face_count: int = Field(0, description="Number of B-Rep faces or mesh facets comprising this sub-part")
    machining_features: List[str] = Field(default_factory=list, description="Detected machining features (thru-holes, blind holes, pockets, chamfers, grooves)")
    oem_match: Optional[Dict[str, Any]] = Field(None, description="Zero-shot cosine similarity match from Renault-Nissan OEM Catalog")
    embedding_512: Optional[List[float]] = Field(None, description="512-D L2-normalized metric learning embedding vector")


class AssemblySummary(BaseModel):
    model_config = ConfigDict(extra="ignore")
    total_parts_detected: int = Field(..., description="Count of decomposed or parsed sub-components")
    total_bounding_envelope: BoundingEnvelope = Field(..., description="Overall axis-aligned bounding envelope")
    overall_center_of_mass: List[float] = Field(
        ...,
        description="Assembly center of mass [x, y, z] in mm",
        min_length=3,
        max_length=3,
    )
    total_mass_kg: float = Field(..., description="Total assembly mass assuming steel density 7850 kg/m^3")
    total_volume_mm3: float = Field(..., description="Total assembly volume in mm^3")
    total_surface_area_mm2: float = Field(..., description="Total assembly surface area in mm^2")


class TaskStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"


class CADProfileResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    task_id: str = Field(..., description="Unique asynchronous job identifier")
    status: TaskStatus = Field(..., description="Current processing state")
    filename: str = Field(..., description="Uploaded CAD source filename")
    ingestion_path: str = Field(..., description="Ingestion pipeline used ('parametric_brep' or 'discrete_mesh')")
    assembly_summary: Optional[AssemblySummary] = Field(None, description="Global assembly metrology summary")
    components: List[ComponentProfile] = Field(default_factory=list, description="List of segmented constituent parts")
    execution_time_seconds: Optional[float] = Field(None, description="Total pipeline execution duration in seconds")
    error: Optional[str] = Field(None, description="Error trace if task failed")
