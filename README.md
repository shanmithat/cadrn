# AutoCAD-Profiler: Automotive CAD Profiling, Segmentation & Metrology

**Delivery for Renault Nissan Automotive R&D**

`AutoCAD-Profiler` is an enterprise-grade computational geometry and geometric deep learning system provided in two deployment architectures:
1. **100% Client-Side Serverless Single Page Application (SPA)**: Built with React 18, Three.js, WebAssembly (`opencascade.js`), and `onnxruntime-web` (WebGPU/Wasm). Deployable directly to GitHub Pages (`<username>.github.io/<repo>`) with zero backend dependencies.
2. **High-Throughput Microservice**: Built with FastAPI, Celery, Redis, OpenCASCADE (`pythonocc-core` v7.7.2), PyG, and WeasyPrint, containerized via Docker.


---

## 1. Architectural Architecture & Core Tech Stack

```
                                  [ Upload CAD File ]
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
          [ STEP / IGES ]                                  [ STL / OBJ ]
                   │                                             │
      pythonocc-core B-Rep Ingestion                    trimesh Discrete Mesh Ingestion
      - ShapeFix_Shape (healing)                        - Watertightness / Manifold checks
      - Curvatures (K, H), Face types                   - Laplace-Beltrami operator
      - Dihedral angles & Concavity                     - Vertex dihedral angles
      - torch_geometric Data graph                      - Furthest Point Sampling (FPS)
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          ▼
                         [ Decomposition Engine ]
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
        B-Rep Seam Graph Cuts                         Dual-Mesh Spectral Clustering
        (Concave boundary seams)                      (Normal & spatial Gaussian affinity)
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          │
                             [ Neural GNN / PointNeXt ]
                                (Contrastive InfoNCE)
                                          │
                                          ▼
                       [ Analytical Metrology Engine ]
         - Divergence theorem exact volume & center of mass
         - Exact 3x3 inertia tensor & principal moments (PCA OBB)
         - Interior ray casting for min wall thickness
         - Automotive classification (Fastener, Bracket, Flange, Housing, etc.)
         - DFM rule checks (undercuts, zero-draft, aspect ratio)
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
       [ Pydantic v2 JSON Response ]                [ WeasyPrint 2-Page Executive PDF ]
       (BOM, mass props, DFM flags)                 (Automotive Engineering Report)
```

- **Geometry Core**: Python 3.11+, `pythonocc-core` (OpenCASCADE v7.7.2), `trimesh`, `scipy`, `numpy`, `rtree`.
- **Deep Learning / Geometric ML**: `PyTorch 2.x`, `torch-geometric` (PyG), `einops`, `scikit-learn`.
- **API & Task Pipeline**: `FastAPI`, `Celery`, `Redis`, `Pydantic v2`, `Uvicorn`.
- **Reporting Engine**: `WeasyPrint` (headless HTML-to-PDF with GTK/Pango) + `FPDF2` fallback.

---

## 2. Mathematical Formulations (No Mock Math)

### A. Volume & Centroid via Divergence Theorem
By the Divergence Theorem, the volume of a 3D polyhedral domain $\Omega$ with boundary surface $\partial \Omega$ is given by:
$$V = \iiint_{\Omega} \nabla \cdot \left(\frac{1}{3}\mathbf{x}\right) dV = \frac{1}{3} \iint_{\partial \Omega} (\mathbf{x} \cdot \mathbf{n}) dA = \frac{1}{6} \sum_{t} \mathbf{v}_0 \cdot (\mathbf{v}_1 \times \mathbf{v}_2)$$
where $\mathbf{v}_0, \mathbf{v}_1, \mathbf{v}_2$ are the oriented vertices of triangular facet $t$.

The center of mass (centroid) $\mathbf{c} \in \mathbb{R}^3$ is evaluated exactly over the tetrahedral decomposition:
$$\mathbf{c} = \frac{1}{4V} \sum_{t} V_t (\mathbf{v}_0 + \mathbf{v}_1 + \mathbf{v}_2)$$

### B. 3x3 Principal Inertia Tensor
The second-order monomials $\int x^2 dV$, $\int y^2 dV$, $\int z^2 dV$, $\int xy dV$, $\int yz dV$, $\int zx dV$ are calculated via the exact Eberly/Mirtich formulation over tetrahedra originating at the origin:
$$\int_{\text{tet}} x^2 dV = \frac{V_t}{10} (x_0^2 + x_1^2 + x_2^2 + x_0 x_1 + x_1 x_2 + x_2 x_0)$$
$$\int_{\text{tet}} xy dV = \frac{V_t}{20} (2 x_0 y_0 + 2 x_1 y_1 + 2 x_2 y_2 + x_0 y_1 + x_1 y_0 + x_1 y_2 + x_2 y_1 + x_2 y_0 + x_0 y_2)$$

The inertia tensor about the origin $\mathbf{I}^{(O)}$ is transformed to the centroid $\mathbf{c}$ using the **Parallel Axis Theorem**:
$$I_{xx}^{(C)} = I_{xx}^{(O)} - \rho V (c_y^2 + c_z^2), \quad I_{xy}^{(C)} = I_{xy}^{(O)} + \rho V c_x c_y$$
Physical mass uses standard automotive steel density $\rho = 7,850 \, \text{kg/m}^3 = 7.850 \times 10^{-6} \, \text{kg/mm}^3$.
Eigen-decomposition $\mathbf{I}^{(C)} = \mathbf{V} \mathbf{\Lambda} \mathbf{V}^T$ yields the 3 principal moments and principal axes of inertia.

### C. Decomposition of Merged Solids (Dual-Graph Spectral Clustering)
To dissect single-mesh assemblies where CAD feature trees were flattened or welded:
1. **Gaussian Affinity**: Face adjacency edges $(i, j)$ are weighted by normal variation and spatial proximity:
   $$W_{ij} = \exp\left(-\frac{\|\mathbf{n}_i - \mathbf{n}_j\|^2}{2\sigma_n^2}\right) \cdot \exp\left(-\frac{\|\mathbf{c}_i - \mathbf{c}_j\|^2}{2\sigma_s^2}\right)$$
2. **Concave Seam Cut**: Edges crossing concave seams ($\theta < 180^\circ - \epsilon$) are penalized ($W_{ij} \leftarrow 0.05 W_{ij}$).
3. **Normalized Cuts**: Spectral partitioning on the normalized Laplacian $L_{\text{sym}} = \mathbf{I} - \mathbf{D}^{-1/2} \mathbf{W} \mathbf{D}^{-1/2}$ extracts sub-bodies $\Omega_k$.

### D. Furthest Point Sampling (FPS) & Cotangent Laplace-Beltrami Operator
- Uniform sampling of $N = 2048$ points $P \in \mathbb{R}^{N \times 6}$ ($x, y, z, n_x, n_y, n_z$) by iteratively maximizing the minimum geodesic distance to the sampled set.
- Cotangent weights for mesh Laplace-Beltrami operator:
  $$L_{ij} = \frac{1}{2}(\cot \alpha_{ij} + \cot \beta_{ij})$$

---

## 3. Project Directory Structure

```text
autocad_profiler/
├── api/
│   ├── __init__.py
│   ├── main.py             # FastAPI REST endpoints and background execution
│   ├── schemas.py          # API Pydantic v2 schemas and response models
│   └── tasks.py            # Celery asynchronous task pipeline and Redis orchestration
├── core/
│   ├── __init__.py
│   ├── parser.py           # Dual Ingestion & Topology Parser (OCC B-Rep & trimesh)
│   ├── segmentation.py     # Graph-cut decomposition, dual spectral clustering, PointNeXt GNN
│   ├── metrology.py        # Vector calculus mass properties, OBB PCA, wall thickness, DFM
│   ├── reporter.py         # WeasyPrint 2-page automotive engineering report generator
│   └── schemas.py          # Domain data contracts (ComponentProfile, AssemblySummary, etc.)
├── tests/
│   ├── __init__.py
│   ├── test_parser.py      # Parser, FPS, cotangent Laplacian, and PyG tests
│   ├── test_segmentation.py# Decomposition, PointNeXt forward, InfoNCE loss tests
│   ├── test_metrology.py   # Divergence theorem volume/inertia, OBB, and DFM tests
│   └── test_api.py         # FastAPI endpoints and integration tests
├── requirements.txt        # Pinned Python package dependencies
├── Dockerfile              # Multi-stage production container with Conda + pythonocc-core
└── README.md
```

---

## 4. Quickstart Guide

### Running with Docker (Recommended for OpenCASCADE + WeasyPrint)
```bash
# Build the production container
docker build -t autocad-profiler:latest .

# Run the microservice
docker run -p 8000:8000 autocad-profiler:latest
```

### Running Locally with Conda
```bash
# Create Conda environment
conda create -n cad_env -c conda-forge python=3.11 pythonocc-core=7.7.2
conda activate cad_env

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Running Celery Worker (with Redis)
```bash
# In a separate terminal
celery -A api.tasks.celery_app worker --loglevel=info
```

---

## 5. API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check and diagnostics (OpenCASCADE status, tech stack) |
| `POST` | `/api/v1/profile` | Ingest raw CAD file (`.step`, `.iges`, `.stl`, `.obj`) |
| `GET` | `/api/v1/profile/{task_id}` | Poll profiling results & Pydantic v2 JSON metrology payload |
| `GET` | `/api/v1/profile/{task_id}/report.pdf` | Download 2-page executive Renault Nissan engineering PDF |
| `GET` | `/api/v1/profile/{task_id}/report.html` | Interactive HTML engineering profile |

---

## 6. Verification & Automated Test Suite

Run the full pytest suite:
```bash
python -m pytest tests/ -v
```

All 20 unit and integration tests validate:
- Ingestion of discrete meshes and parametric models with FPS point cloud generation
- Cotangent Laplace-Beltrami operator properties (row sum = 0)
- Separation of disjoint bodies and dual-graph spectral clustering of merged solids
- PointNeXt forward pass, embedding shapes, and InfoNCE contrastive loss
- Divergence theorem volume, centroid, and inertia tensor against analytical formulas
- PCA OBB dimensions under 3D rotation
- Ray-mesh interior intersection wall thickness estimation
- Rule-based automotive classification and DFM warnings
- End-to-end FastAPI upload, polling, and report download endpoints
