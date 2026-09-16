# ==============================================================================
# AutoCAD-Profiler Production Container
# Renault Nissan Automotive CAD Analytics & Profiling Microservice
# Equipped with OpenCASCADE (pythonocc-core v7.7.2), PyTorch, PyG, WeasyPrint
# ==============================================================================

FROM continuumio/miniconda3:latest AS base

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    CONDA_DIR=/opt/conda \
    PATH=/opt/conda/bin:$PATH

WORKDIR /app

# Install system dependencies for OpenCASCADE rendering, WeasyPrint GTK/Pango, and CAD tessellation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libx11-6 \
    libxext6 \
    libxrender1 \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libfontconfig1 \
    libfreetype6 \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Create conda environment with Python 3.11 and pythonocc-core from conda-forge
RUN conda create -y -n cad_env -c conda-forge \
    python=3.11 \
    pythonocc-core=7.7.2 \
    && conda clean -afy

# Activate conda environment for subsequent steps
ENV PATH="/opt/conda/envs/cad_env/bin:$PATH"
ENV CONDA_DEFAULT_ENV="cad_env"

# Copy and install python dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY core/ /app/core/
COPY api/ /app/api/
COPY tests/ /app/tests/

# Set up storage and runtime directories
RUN mkdir -p /app/uploads_cache /app/reports_cache

EXPOSE 8000

# Default command: launch FastAPI microservice with Uvicorn
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
