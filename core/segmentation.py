"""Decomposition Engine for Merged Geometries.
Isolates constituent automotive components from synthetically unioned, welded,
or single-mesh CAD models using concave seam separation, dual-graph spectral clustering,
and a PyTorch PointNeXt / GNN contrastive neural feature extractor interface.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import math
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import scipy.sparse as sp
from scipy.sparse.linalg import eigsh
from sklearn.cluster import KMeans, MeanShift, SpectralClustering
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.nn import GCNConv

import trimesh

logger = logging.getLogger(__name__)


# ==============================================================================
# 1. Neural Feature Extractor Interface (PointNeXt & GNN with InfoNCE)
# ==============================================================================

class InfoNCELoss(nn.Module):
    """Contrastive InfoNCE Loss for unsupervised or self-supervised part boundary learning.

    Encourages representations of surface points/faces on the same physical component
    to be close in latent space while pushing points across concave seams apart.
    """

    def __init__(self, temperature: float = 0.07):
        super().__init__()
        self.temperature = temperature

    def forward(self, query: torch.Tensor, positive: torch.Tensor, negatives: torch.Tensor) -> torch.Tensor:
        """Args:

        query: (B, D) anchor embeddings
        positive: (B, D) positive embeddings (same component/neighborhood)
        negatives: (B, K, D) negative embeddings (points across seams/components)
        """
        # Normalize embeddings to unit hypersphere
        q = F.normalize(query, dim=-1)
        p = F.normalize(positive, dim=-1)
        n = F.normalize(negatives, dim=-1)

        # Positive logits: (B, 1)
        l_pos = torch.sum(q * p, dim=-1, keepdim=True) / self.temperature

        # Negative logits: (B, K)
        l_neg = torch.bmm(n, q.unsqueeze(-1)).squeeze(-1) / self.temperature

        # Concatenate and compute cross-entropy
        logits = torch.cat([l_pos, l_neg], dim=1)  # (B, 1 + K)
        labels = torch.zeros(logits.size(0), dtype=torch.long, device=logits.device)
        return F.cross_entropy(logits, labels)


class PointNeXtBlock(nn.Module):
    """Inverted Residual MLP block for point clouds (inspired by PointNeXt)."""

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
        # x shape: (B, C, N)
        residual = self.shortcut(x)
        out = self.act(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return self.act(out + residual)


class PointNeXtPartSegmenter(nn.Module):
    """Lightweight PointNeXt feature extractor and part-segmentation network for CAD point clouds."""

    def __init__(self, in_channels: int = 6, embed_dim: int = 64, num_classes: int = 8):
        super().__init__()
        # in_channels: [x, y, z, nx, ny, nz]
        self.stem = nn.Sequential(
            nn.Conv1d(in_channels, embed_dim, 1, bias=False),
            nn.BatchNorm1d(embed_dim),
            nn.GELU(),
        )
        self.stage1 = PointNeXtBlock(embed_dim, embed_dim * 2)
        self.stage2 = PointNeXtBlock(embed_dim * 2, embed_dim * 4)
        self.stage3 = PointNeXtBlock(embed_dim * 4, embed_dim * 2)

        self.head = nn.Sequential(
            nn.Conv1d(embed_dim * 2, embed_dim, 1),
            nn.BatchNorm1d(embed_dim),
            nn.GELU(),
            nn.Conv1d(embed_dim, num_classes, 1),
        )

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """Args:

        x: (B, N, 6) or (B, 6, N) point cloud tensor
        Returns:
            logits: (B, num_classes, N)
            embeddings: (B, embed_dim * 2, N) latent per-point features
        """
        if x.dim() == 2:
            x = x.unsqueeze(0)
        if x.shape[1] != 6 and x.shape[2] == 6:
            x = x.transpose(1, 2)

        feat0 = self.stem(x)
        feat1 = self.stage1(feat0)
        feat2 = self.stage2(feat1)
        feat3 = self.stage3(feat2)
        logits = self.head(feat3)
        return logits, feat3


class CADGraphGNN(nn.Module):
    """Graph Neural Network operating on B-Rep face-edge topology graphs."""

    def __init__(self, in_channels: int = 4, hidden_dim: int = 64, out_dim: int = 16):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_dim)
        self.conv2 = GCNConv(hidden_dim, hidden_dim)
        self.conv3 = GCNConv(hidden_dim, out_dim)
        self.act = nn.LeakyReLU(0.2)

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        h = self.act(self.conv1(x, edge_index))
        h = self.act(self.conv2(h, edge_index))
        out = self.conv3(h, edge_index)
        return F.normalize(out, p=2, dim=-1)


# ==============================================================================
# 2. Decomposition Engine for Merged / Unioned Solids
# ==============================================================================

@dataclass
class SubPartPartition:
    """Represents an isolated constituent sub-part from a merged assembly."""
    part_id: str
    mesh: trimesh.Trimesh
    face_indices: np.ndarray
    confidence: float
    decomposition_method: str  # 'topological_connected', 'concave_seam_cut', 'dual_spectral', or 'neural'


class DecompositionEngine:
    """Decomposes unioned, welded, or single-solid CAD models into constituent sub-components."""

    def __init__(
        self,
        sigma_n: float = 0.35,  # Normal variance parameter
        sigma_s: float = 50.0,  # Spatial distance parameter
        concave_angle_deg: float = 165.0,  # Dihedral angle threshold for concave seam detection
        min_faces_per_part: int = 4,
        max_auto_clusters: int = 8,
    ):

        self.sigma_n = sigma_n
        self.sigma_s = sigma_s
        self.concave_angle_rad = math.radians(concave_angle_deg)
        self.min_faces_per_part = min_faces_per_part
        self.max_auto_clusters = max_auto_clusters
        self.neural_model: Optional[PointNeXtPartSegmenter] = None

    def segment(
        self,
        mesh: trimesh.Trimesh,
        brep_face_attrs: Optional[List[Dict[str, Any]]] = None,
        brep_edge_attrs: Optional[List[Dict[str, Any]]] = None,
        expected_parts: Optional[int] = None,
    ) -> List[SubPartPartition]:
        """Primary segmentation method.

        Attempts:
        1. Natural topological separation (if already multiple disjoint components).
        2. B-Rep concave boundary graph cuts (if B-Rep topology available).
        3. Dual-graph spectral clustering with normal variation & spatial Gaussian weights.
        """
        # Step 1: Check natural topological connected components
        disjoint_parts = self._split_connected_components(mesh)
        if len(disjoint_parts) > 1:
            logger.info(f"Geometry contains {len(disjoint_parts)} natural disjoint bodies.")
            return disjoint_parts

        # Step 2: If B-Rep topology is provided with concave internal boundary seams
        if brep_face_attrs and brep_edge_attrs and len(brep_face_attrs) > 1:
            brep_partitions = self._partition_brep_concave_seams(mesh, brep_face_attrs, brep_edge_attrs)
            if len(brep_partitions) > 1:
                logger.info(f"B-Rep concave seam cut isolated {len(brep_partitions)} sub-bodies.")
                return brep_partitions

        # Step 3: Mesh dual-graph spectral clustering with Gaussian affinity
        spectral_partitions = self._dual_graph_spectral_decomposition(mesh, num_clusters=expected_parts)
        if len(spectral_partitions) > 1:
            logger.info(f"Dual-graph spectral clustering segmented {len(spectral_partitions)} sub-bodies.")
            return spectral_partitions

        # Step 4: Fallback - single intact solid
        logger.info("Decomposition engine identified single monolithic component.")
        return [
            SubPartPartition(
                part_id="PART_001",
                mesh=mesh,
                face_indices=np.arange(len(mesh.faces)),
                confidence=1.0,
                decomposition_method="monolithic_single_solid",
            )
        ]

    def _split_connected_components(self, mesh: trimesh.Trimesh) -> List[SubPartPartition]:
        """Separates physically disjoint components in the mesh."""
        components = mesh.split(only_watertight=False)
        if len(components) <= 1:
            return []

        partitions = []
        # Filter tiny noise fragments
        valid_components = [c for c in components if len(c.faces) >= self.min_faces_per_part]
        if len(valid_components) <= 1:
            return []

        for idx, comp in enumerate(valid_components):
            partitions.append(
                SubPartPartition(
                    part_id=f"PART_{idx + 1:03d}",
                    mesh=comp,
                    face_indices=np.array([], dtype=np.int64),
                    confidence=1.0,
                    decomposition_method="topological_connected",
                )
            )
        return partitions

    def _partition_brep_concave_seams(
        self,
        mesh: trimesh.Trimesh,
        brep_face_attrs: List[Dict[str, Any]],
        brep_edge_attrs: List[Dict[str, Any]],
    ) -> List[SubPartPartition]:
        """Detects internal concave contact seams (dihedral angle < 180 - epsilon)

        and partitions the B-Rep face adjacency graph.
        """
        num_faces = len(brep_face_attrs)
        if num_faces < 2:
            return []

        # Build adjacency matrix
        adj = np.zeros((num_faces, num_faces), dtype=np.float32)
        for edge in brep_edge_attrs:
            u = edge["face_u"]
            v = edge["face_v"]
            is_concave = edge.get("is_concave", False)
            angle = edge.get("dihedral_angle_rad", math.pi)

            # If edge is concave (angle < concave_angle_rad), cut the link (assign zero weight)
            if is_concave or angle < self.concave_angle_rad:
                weight = 0.001  # Boundary cut
            else:
                weight = 1.0  # Same part continuous smooth transition

            adj[u, v] = weight
            adj[v, u] = weight

        # Count connected components on high-confidence edges
        binary_adj = (adj > 0.1).astype(int)
        num_comp, labels = sp.csgraph.connected_components(binary_adj, directed=False)

        if 1 < num_comp <= self.max_auto_clusters:
            # Map B-Rep clusters to partitions
            partitions = []
            for c in range(num_comp):
                face_set = np.where(labels == c)[0]
                if len(face_set) == 0:
                    continue
                # Create a representative partition
                partitions.append(
                    SubPartPartition(
                        part_id=f"PART_{c + 1:03d}",
                        mesh=mesh,  # Proxy mesh or sub-mesh
                        face_indices=face_set,
                        confidence=0.92,
                        decomposition_method="concave_seam_cut",
                    )
                )
            return partitions

        return []

    def _dual_graph_spectral_decomposition(
        self,
        mesh: trimesh.Trimesh,
        num_clusters: Optional[int] = None,
    ) -> List[SubPartPartition]:
        """Dual-graph spectral clustering on mesh faces.

        Weighting formula:
            W_ij = exp(- ||n_i - n_j||^2 / (2 * sigma_n^2)) * exp(- ||c_i - c_j||^2 / (2 * sigma_s^2))
        """
        num_faces = len(mesh.faces)
        if num_faces < self.min_faces_per_part * 2:
            return []

        adj = mesh.face_adjacency
        if len(adj) == 0:
            return []

        normals = mesh.face_normals
        centers = mesh.triangles_center

        # Face adjacency pairs
        i = adj[:, 0]
        j = adj[:, 1]

        # Normal difference squared: ||n_i - n_j||^2
        diff_n = normals[i] - normals[j]
        sq_dist_n = np.sum(diff_n * diff_n, axis=1)

        # Spatial center distance squared: ||c_i - c_j||^2
        diff_s = centers[i] - centers[j]
        sq_dist_s = np.sum(diff_s * diff_s, axis=1)

        # Dihedral angle penalty for concave seams
        dots = np.clip(np.sum(normals[i] * normals[j], axis=1), -1.0, 1.0)
        angles = np.arccos(dots)
        seam_penalty = np.where(angles > (math.pi - self.concave_angle_rad), 0.05, 1.0)

        # Gaussian weights
        weights = (
            np.exp(-sq_dist_n / (2.0 * (self.sigma_n ** 2)))
            * np.exp(-sq_dist_s / (2.0 * (self.sigma_s ** 2)))
            * seam_penalty
        ).astype(np.float32)

        # Filter out negligible affinities
        valid_mask = weights > 1e-4
        i_filtered = i[valid_mask]
        j_filtered = j[valid_mask]
        w_filtered = weights[valid_mask]

        if len(w_filtered) == 0:
            return []

        # Symmetrize affinity matrix W
        row = np.concatenate([i_filtered, j_filtered])
        col = np.concatenate([j_filtered, i_filtered])
        data = np.concatenate([w_filtered, w_filtered])
        W = sp.coo_matrix((data, (row, col)), shape=(num_faces, num_faces)).tocsr()

        # Determine target number of clusters k
        k = num_clusters or self._estimate_optimal_clusters(W, max_k=self.max_auto_clusters)
        if k <= 1:
            return []

        # Perform Normalized Spectral Clustering
        try:
            # Degree matrix D and normalized Laplacian L_sym = I - D^(-1/2) W D^(-1/2)
            deg = np.array(W.sum(axis=1)).flatten()
            deg[deg < 1e-12] = 1e-12
            deg_inv_sqrt = 1.0 / np.sqrt(deg)
            D_inv_sqrt = sp.diags(deg_inv_sqrt)
            W_norm = D_inv_sqrt.dot(W).dot(D_inv_sqrt)

            # Compute top k eigenvectors of normalized affinity W_norm
            num_eigs = min(k + 1, num_faces - 1)
            vals, vecs = eigsh(W_norm, k=num_eigs, which="LM")
            # Select eigenvectors corresponding to largest eigenvalues
            eig_features = vecs[:, -k:]
            # Normalize rows to unit length
            row_norms = np.linalg.norm(eig_features, axis=1, keepdims=True)
            row_norms[row_norms < 1e-12] = 1e-12
            eig_features = eig_features / row_norms

            # Cluster face embeddings via k-means
            kmeans = KMeans(n_clusters=k, n_init=5, random_state=42)
            face_labels = kmeans.fit_predict(eig_features)

            # Extract sub-meshes for each partition
            partitions = []
            for cluster_id in range(k):
                cluster_faces = np.where(face_labels == cluster_id)[0]
                if len(cluster_faces) < self.min_faces_per_part:
                    continue

                sub_mesh = mesh.submesh([cluster_faces], append=True)
                if len(sub_mesh.faces) >= self.min_faces_per_part:
                    partitions.append(
                        SubPartPartition(
                            part_id=f"PART_{len(partitions) + 1:03d}",
                            mesh=sub_mesh,
                            face_indices=cluster_faces,
                            confidence=0.88,
                            decomposition_method="dual_spectral",
                        )
                    )

            if len(partitions) > 1:
                return partitions

        except Exception as e:
            logger.warning(f"Spectral decomposition encountered numerical error: {e}. Trying Mean-Shift fallback.")

        # Fallback: MeanShift on coordinates + normals
        return self._meanshift_clustering_fallback(mesh, k_target=k)

    def _estimate_optimal_clusters(self, W: sp.csr_matrix, max_k: int = 6) -> int:
        """Eigengap heuristic on Laplacian to determine optimal number of sub-parts."""
        try:
            deg = np.array(W.sum(axis=1)).flatten()
            deg[deg < 1e-12] = 1e-12
            D_inv_sqrt = sp.diags(1.0 / np.sqrt(deg))
            W_norm = D_inv_sqrt.dot(W).dot(D_inv_sqrt)

            k_calc = min(max_k + 2, W.shape[0] - 1)
            if k_calc < 3:
                return 2

            vals, _ = eigsh(W_norm, k=k_calc, which="LM")
            vals = np.sort(vals)[::-1]  # Descending order: 1.0, lambda2, ...
            gaps = vals[:-1] - vals[1:]
            # Find index with largest eigengap (excluding index 0)
            best_k = int(np.argmax(gaps[1:max_k]) + 2)
            return max(2, min(best_k, max_k))
        except Exception:
            return 2

    def _meanshift_clustering_fallback(self, mesh: trimesh.Trimesh, k_target: int = 2) -> List[SubPartPartition]:
        """Mean-shift / spatial-normal clustering fallback for merged meshes."""
        try:
            centers = mesh.triangles_center
            normals = mesh.face_normals
            # Combined spatial + normal feature vector (normalized)
            spatial_scale = np.std(centers, axis=0)
            spatial_scale[spatial_scale < 1e-6] = 1.0
            norm_centers = (centers - np.mean(centers, axis=0)) / spatial_scale
            features = np.hstack([norm_centers, normals * 2.0])

            kmeans = KMeans(n_clusters=k_target, n_init=3, random_state=42)
            labels = kmeans.fit_predict(features)

            partitions = []
            for cid in range(k_target):
                c_faces = np.where(labels == cid)[0]
                if len(c_faces) >= self.min_faces_per_part:
                    sub = mesh.submesh([c_faces], append=True)
                    if len(sub.faces) >= self.min_faces_per_part:
                        partitions.append(
                            SubPartPartition(
                                part_id=f"PART_{len(partitions) + 1:03d}",
                                mesh=sub,
                                face_indices=c_faces,
                                confidence=0.75,
                                decomposition_method="spatial_normal_clustering",
                            )
                        )
            return partitions
        except Exception as e:
            logger.error(f"Clustering fallback failed: {e}")
            return []
