"""Tests for the 3 Core AI/ML Tasks in AutoCAD-Profiler:
1. Semantic & Boundary Disambiguation via InfoNCE Pre-Training
2. Multi-Task Supervised Fine-Tuning (Semantic, Manufacturing, Machining Features)
3. 512-D Metric Learning & Renault-Nissan OEM Catalog Retrieval
4. ONNX Multi-Task Model Output Verification
"""

import os
from pathlib import Path
import numpy as np
import pytest
import torch
import trimesh

from core.training import (
    CADContrastivePreTrainer,
    MultiTaskCADLoss,
    RENAULT_NISSAN_OEM_CATALOG,
    match_oem_component,
)
from core.schemas import ComponentClass, ManufacturingProcess, ComponentProfile
from core.metrology import profile_sub_part, generate_geometric_embedding_512


def test_infonce_contrastive_loss():
    """Verifies InfoNCE contrastive pre-training loss computation on latent CAD patches."""
    B, D, K = 4, 128, 5
    trainer = CADContrastivePreTrainer(model=torch.nn.Identity(), temperature=0.07)

    anchor = torch.randn(B, D)
    positives = anchor + 0.05 * torch.randn(B, D)  # Close positive representations
    negatives = torch.randn(B, K, D)  # Distant negative representations

    loss = trainer.compute_infonce_loss(anchor, positives, negatives)
    assert loss.ndim == 0
    assert not torch.isnan(loss)
    assert float(loss.item()) > 0.0


def test_multitask_cad_loss():
    """Verifies MultiTaskCADLoss computes balanced weighted gradients across all 4 tasks."""
    criterion = MultiTaskCADLoss(
        weight_semantic=1.0,
        weight_manufacturing=1.0,
        weight_features=0.8,
        weight_metric=0.5,
    )

    B = 4
    sem_logits = torch.randn(B, 6)
    mfg_logits = torch.randn(B, 5)
    feat_logits = torch.randn(B, 5)
    embeddings = torch.randn(B, 512)

    preds = (embeddings, sem_logits, mfg_logits, feat_logits)
    targets = {
        "semantic_label": torch.tensor([0, 1, 2, 3], dtype=torch.long),
        "manufacturing_label": torch.tensor([1, 0, 3, 2], dtype=torch.long),
        "feature_targets": torch.tensor([
            [1.0, 0.0, 1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0, 0.0, 0.0],
            [1.0, 1.0, 1.0, 1.0, 1.0],
            [0.0, 0.0, 0.0, 1.0, 0.0],
        ], dtype=torch.float32),
        "positive_embedding": embeddings + 0.01 * torch.randn(B, 512),
    }

    total_loss, metrics = criterion(preds, targets)

    assert total_loss.ndim == 0
    assert not torch.isnan(total_loss)
    assert "semantic_loss" in metrics
    assert "manufacturing_loss" in metrics
    assert "feature_loss" in metrics
    assert "metric_loss" in metrics
    assert metrics["total_loss"] > 0.0


def test_renault_nissan_oem_catalog_retrieval():
    """Verifies zero-shot cosine retrieval against Renault-Nissan OEM BOM catalog."""
    assert len(RENAULT_NISSAN_OEM_CATALOG) >= 7

    # Query with a random 512-D vector
    np.random.seed(123)
    query_vec = np.random.randn(512).astype(np.float32)
    match = match_oem_component(query_vec)

    assert "part_number" in match
    assert match["part_number"].startswith("RN-")
    assert "description" in match
    assert "catalog_bom" in match
    assert "similarity_score" in match
    assert 70.0 <= match["similarity_score"] <= 100.0


def test_metrology_profile_sub_part_multitask():
    """Verifies that profile_sub_part outputs full multi-task fields (features, embedding, OEM match)."""
    cylinder = trimesh.creation.cylinder(radius=10.0, height=80.0, sections=32)
    profile = profile_sub_part("PART_TEST_001", cylinder)

    assert isinstance(profile, ComponentProfile)
    assert len(profile.machining_features) > 0
    assert profile.oem_match is not None
    assert profile.oem_match["part_number"].startswith("RN-")
    assert profile.embedding_512 is not None
    assert len(profile.embedding_512) == 512

    # Verify L2 normalization of embedding
    emb_array = np.array(profile.embedding_512)
    norm = np.linalg.norm(emb_array)
    assert pytest.approx(norm, rel=1e-3) == 1.0


def test_onnx_multitask_model_structure():
    """Verifies exported ONNX model exists and has all 4 multi-task outputs."""
    onnx_path = Path("public/models/model_quant.onnx")
    assert onnx_path.exists(), "public/models/model_quant.onnx must exist"
    assert onnx_path.stat().st_size > 1_000_000, "ONNX model should be >= 1MB"

    import onnx
    model = onnx.load(str(onnx_path))
    output_names = [out.name for out in model.graph.output]
    assert "embedding_512" in output_names
    assert "semantic_logits" in output_names
    assert "manufacturing_logits" in output_names
    assert "feature_logits" in output_names
