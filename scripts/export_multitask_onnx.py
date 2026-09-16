"""Script to generate and export the Multi-Task CAD Neural Network to ONNX.
Implements the 3 Core AI/ML Tasks:
1. Latent embedding feature representation for boundary disambiguation
2. Multi-task supervised heads:
   - Semantic Component Classification (8 classes)
   - Manufacturing Method Prediction (5 classes)
   - Machining Feature Detection (5 classes)
3. 512-Dimensional L2-Normalized Metric Embedding for Zero-Shot OEM BOM Retrieval
"""

import os
from pathlib import Path
import torch
import torch.nn as nn
import torch.nn.functional as F


class PointNeXtResidualBlock(nn.Module):
    """Inverted Residual MLP block for point cloud geometry."""

    def __init__(self, in_dim: int, out_dim: int, expansion: int = 2):
        super().__init__()
        hidden_dim = in_dim * expansion
        self.conv1 = nn.Conv1d(in_dim, hidden_dim, 1, bias=False)
        self.bn1 = nn.BatchNorm1d(hidden_dim)
        self.act = nn.GELU()
        self.conv2 = nn.Conv1d(hidden_dim, out_dim, 1, bias=False)
        self.bn2 = nn.BatchNorm1d(out_dim)
        self.shortcut = nn.Conv1d(in_dim, out_dim, 1) if in_dim != out_dim else nn.Identity()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        res = self.shortcut(x)
        out = self.act(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return self.act(out + res)


class MultiTaskCADNet(nn.Module):
    """PointNeXt-based Multi-Task CAD Neural Network.

    Processes 3D point clouds with surface normals [B, 6, N] and outputs:
    - embedding_512: (B, 512) Normalized metric embedding for enterprise BOM retrieval
    - semantic_logits: (B, 8) Component class logits
    - manufacturing_logits: (B, 5) Manufacturing process logits
    - feature_logits: (B, 5) Machining feature detection logits
    """

    def __init__(self, in_channels: int = 6):
        super().__init__()

        # Stem & Hierarchical Feature Encoding
        self.stem = nn.Sequential(
            nn.Conv1d(in_channels, 32, 1, bias=False),
            nn.BatchNorm1d(32),
            nn.GELU(),
        )
        self.stage1 = PointNeXtResidualBlock(32, 64)
        self.stage2 = PointNeXtResidualBlock(64, 128)
        self.stage3 = PointNeXtResidualBlock(128, 256)

        # Global Multi-Scale Pooling projection (Mean + Max)
        self.global_proj = nn.Sequential(
            nn.Linear(256 * 2, 512),
            nn.BatchNorm1d(512),
            nn.GELU(),
        )

        # Head 1: 512-D Metric Embedding Head (L2 Normalized)
        self.metric_head = nn.Sequential(
            nn.Linear(512, 512),
            nn.BatchNorm1d(512),
        )

        # Head 2: Semantic Component Classification (8 Classes)
        # [Fastener/Bolt, Bracket, Flange, Housing/Casing, Shaft, Gear, Sheet Metal Panel, Suspension Arm]
        self.semantic_head = nn.Sequential(
            nn.Linear(512, 128),
            nn.GELU(),
            nn.Linear(128, 8),
        )

        # Head 3: Manufacturing Method Inference (5 Processes)
        # [High-Pressure Die Casting, 3-Axis CNC Milled, 5-Axis CNC Milled, Sheet Metal Stamping, Additive Manufacturing]
        self.manufacturing_head = nn.Sequential(
            nn.Linear(512, 128),
            nn.GELU(),
            nn.Linear(128, 5),
        )

        # Head 4: Machining Feature Detection (5 Features)
        # [Thru-Holes, Blind Holes, Pockets, Chamfers/Fillets, O-Ring Grooves]
        self.feature_head = nn.Sequential(
            nn.Linear(512, 128),
            nn.GELU(),
            nn.Linear(128, 5),
        )

    def forward(self, x: torch.Tensor):
        # x: (B, 6, N)
        feat0 = self.stem(x)
        feat1 = self.stage1(feat0)
        feat2 = self.stage2(feat1)
        feat3 = self.stage3(feat2)  # (B, 256, N)

        # Multi-scale aggregation: concatenate mean and max pooling
        pool_max = torch.max(feat3, dim=2)[0]
        pool_mean = torch.mean(feat3, dim=2)
        pooled = torch.cat([pool_max, pool_mean], dim=1)  # (B, 512)

        latent = self.global_proj(pooled)

        # 1. 512-D Normalized Metric Embedding
        raw_emb = self.metric_head(latent)
        embedding_512 = F.normalize(raw_emb, p=2, dim=-1)

        # 2. Semantic Class Logits
        semantic_logits = self.semantic_head(latent)

        # 3. Manufacturing Process Logits
        manufacturing_logits = self.manufacturing_head(latent)

        # 4. Machining Feature Detection Logits
        feature_logits = self.feature_head(latent)

        return embedding_512, semantic_logits, manufacturing_logits, feature_logits


def export_model():
    output_dir = Path("public/models")
    output_dir.mkdir(parents=True, exist_ok=True)
    onnx_file = output_dir / "model_quant.onnx"

    print("Building MultiTaskCADNet...")
    model = MultiTaskCADNet(in_channels=6)
    model.eval()

    # Create synthetic point cloud tensor [1, 6, 2048]
    dummy_input = torch.randn(1, 6, 2048, dtype=torch.float32)

    print("Exporting ONNX model with 4 Multi-Task Heads...")
    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_file),
        input_names=["point_cloud"],
        output_names=["embedding_512", "semantic_logits", "manufacturing_logits", "feature_logits"],
        dynamic_axes={
            "point_cloud": {0: "batch_size", 2: "num_points"},
            "embedding_512": {0: "batch_size"},
            "semantic_logits": {0: "batch_size"},
            "manufacturing_logits": {0: "batch_size"},
            "feature_logits": {0: "batch_size"},
        },
        opset_version=18,
        dynamo=False,
    )

    file_size_kb = os.path.getsize(onnx_file) / 1024
    print(f"Export successful: {onnx_file} ({file_size_kb:.1f} KB)")


if __name__ == "__main__":
    export_model()
