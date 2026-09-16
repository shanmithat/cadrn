"""AutoCAD-Profiler Core Engine.
Automotive CAD profiling, B-Rep/mesh topology parsing, decomposition of merged solids,
exact divergence theorem metrology, and executive engineering reports.
"""

from core.schemas import (
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
from core.parser import CADParser, ParsedCAD
from core.segmentation import DecompositionEngine, SubPartPartition
from core.metrology import compute_exact_mass_properties, profile_sub_part
from core.reporter import ReportGenerator

__all__ = [
    "CADParser",
    "ParsedCAD",
    "DecompositionEngine",
    "SubPartPartition",
    "compute_exact_mass_properties",
    "profile_sub_part",
    "ReportGenerator",
    "CADProfileResponse",
    "ComponentProfile",
    "ComponentClass",
    "ManufacturingProcess",
    "TaskStatus",
]
