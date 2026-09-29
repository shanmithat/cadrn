"""Tests for Manufacturing Features and GD&T Extraction Engines."""

import pytest
from core.features import (
    ManufacturingFeatureExtractor,
    HoleType,
    ToolApproachDirection,
    match_iso_metric_thread,
    infer_iso_286_fit,
)
from core.gdt import GDTEngine, GDTSymbol, GDTStatus
from core.metrology import extract_cad_manufacturing_features_and_gdt


def test_iso_metric_thread_matching():
    """Verify core tap drill sizes map to correct ISO metric threads."""
    assert match_iso_metric_thread(5.0) == "M6 x 1.0 (Metric Coarse)"
    assert match_iso_metric_thread(6.8) == "M8 x 1.25 (Metric Coarse)"
    assert match_iso_metric_thread(8.5) == "M10 x 1.5 (Metric Coarse)"
    assert match_iso_metric_thread(10.2) == "M12 x 1.75 (Metric Coarse)"
    assert match_iso_metric_thread(22.0) is None


def test_iso_286_fit_inference():
    """Verify fit inference for bores, dowel holes, and clearance."""
    assert "H6" in infer_iso_286_fit(80.0, HoleType.STEPPED_BORE)
    assert "H7" in infer_iso_286_fit(6.0, HoleType.THROUGH_HOLE)
    assert "H11" in infer_iso_286_fit(12.0, HoleType.COUNTERBORED_HOLE)


def test_step_manufacturing_features_dissection():
    """Dissects real STEP model (GSD model 2.stp) and verifies holes, patterns, pockets, and GD&T."""
    with open("GSD model 2.stp", "r", errors="ignore") as f:
        text = f.read()

    mfg_report = ManufacturingFeatureExtractor.extract_from_step_text(text)
    assert mfg_report.total_holes_count == 37
    assert len(mfg_report.hole_patterns) >= 1
    assert mfg_report.total_pockets_count >= 1
    assert mfg_report.total_grooves_count >= 1
    assert mfg_report.total_planar_faces_count == 28
    assert len(mfg_report.fillets) == 17

    # Check GD&T
    gdt_report = GDTEngine.evaluate_gdt(
        mfg_report.holes,
        mfg_report.hole_patterns,
        mfg_report.planar_faces,
    )
    assert len(gdt_report.datum_reference_frame) == 3
    assert gdt_report.datum_reference_frame[0].datum_label == "A"
    assert len(gdt_report.feature_control_frames) >= 6
    assert gdt_report.passed_count >= 6
    assert len(gdt_report.iso_286_fits) >= 4


def test_metrology_manufacturing_features_and_gdt_export():
    """Verify extract_cad_manufacturing_features_and_gdt returns serializable dicts."""
    with open("GSD model 2.stp", "r", errors="ignore") as f:
        text = f.read()

    mfg_dict, gdt_dict = extract_cad_manufacturing_features_and_gdt(step_text=text)
    assert "holes" in mfg_dict
    assert "hole_patterns" in mfg_dict
    assert "pockets" in mfg_dict
    assert "datum_reference_frame" in gdt_dict
    assert "feature_control_frames" in gdt_dict
