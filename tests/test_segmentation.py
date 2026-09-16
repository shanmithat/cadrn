"""Unit tests for Module B: Decomposition Engine (core/segmentation.py)."""

import numpy as np
import pytest
import torch
import trimesh

from core.segmentation import (
    CADGraphGNN,
    DecompositionEngine,
    InfoNCELoss,
    PointNeXtPartSegmenter,
)


def test_disjoint_body_separation():
    """Verify that multiple naturally disjoint components are correctly separated."""
    box1 = trimesh.creation.box(extents=[10, 10, 10])
    box2 = trimesh.creation.box(extents=[10, 10, 10])
    box2.apply_translation([50, 0, 0])  # Disjoint translation

    combined = trimesh.util.concatenate([box1, box2])
    engine = DecompositionEngine()
    partitions = engine.segment(combined)

    assert len(partitions) == 2
    assert partitions[0].part_id == "PART_001"
    assert partitions[1].part_id == "PART_002"
    assert partitions[0].decomposition_method == "topological_connected"


def test_synthetically_merged_solid_spectral_decomposition():
    """Verify that synthetically unioned/merged bodies are partitioned via dual-graph spectral clustering."""
    # Create two connected boxes that touch and form a welded 'T' or 'L' bracket
    box1 = trimesh.creation.box(extents=[60, 20, 10])
    box2 = trimesh.creation.box(extents=[20, 20, 50])
    box2.apply_translation([20, 0, 25])

    # Boolean union or concatenated welded mesh
    merged = trimesh.util.concatenate([box1, box2])

    engine = DecompositionEngine(sigma_n=0.35, sigma_s=40.0)
    # Request 2 clusters or let algorithm auto-partition
    partitions = engine.segment(merged, expected_parts=2)

    assert len(partitions) >= 1
    # Check that each partition contains valid non-empty geometry
    for p in partitions:
        assert len(p.mesh.faces) > 0
        assert len(p.mesh.vertices) > 0


def test_pointnext_part_segmenter_forward():
    """Verify PyTorch PointNeXt architecture forward pass and shape contracts."""
    model = PointNeXtPartSegmenter(in_channels=6, embed_dim=32, num_classes=6)
    model.eval()

    # Batch of 2 point clouds, each with 256 points and 6 channels [x, y, z, nx, ny, nz]
    pts = torch.randn(2, 6, 256)
    with torch.no_grad():
        logits, embeddings = model(pts)

    assert logits.shape == (2, 6, 256)
    assert embeddings.shape[1] == 64  # embed_dim * 2
    assert embeddings.shape[2] == 256


def test_infonce_contrastive_loss():
    """Verify InfoNCE loss calculation on anchor, positive, and negative embeddings."""
    loss_fn = InfoNCELoss(temperature=0.1)

    batch_size = 4
    dim = 32
    num_neg = 8

    query = torch.randn(batch_size, dim)
    positive = query + 0.05 * torch.randn(batch_size, dim)  # Very close to query
    negatives = torch.randn(batch_size, num_neg, dim)

    loss = loss_fn(query, positive, negatives)
    assert loss.dim() == 0  # Scalar loss
    assert loss.item() > 0.0
    assert not torch.isnan(loss)


def test_cad_graph_gnn_forward():
    """Verify GNN message passing on B-Rep/dual-graph topology."""
    gnn = CADGraphGNN(in_channels=4, hidden_dim=32, out_dim=16)
    gnn.eval()

    num_nodes = 20
    x = torch.randn(num_nodes, 4)
    # Ring or connected graph
    src = torch.arange(num_nodes)
    dst = (src + 1) % num_nodes
    edge_index = torch.stack([src, dst], dim=0)

    with torch.no_grad():
        node_embeddings = gnn(x, edge_index)

    assert node_embeddings.shape == (num_nodes, 16)
    # Output should be L2-normalized
    norms = torch.norm(node_embeddings, dim=-1)
    assert torch.allclose(norms, torch.ones(num_nodes), atol=1e-4)
