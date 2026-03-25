FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# Set noninteractive to avoid apt prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Install git, pip3, curl, and required build tools for nvidia runtime mapping
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3-pip \
    python3.10-dev \
    libpython3.10-dev \
    curl \
    apt-transport-https \
    ca-certificates \
    gnupg \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install uv

# Install Google Cloud CLI
RUN curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update && apt-get install -y --no-install-recommends google-cloud-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN git clone https://github.com/jwohlwend/boltz.git /app/boltz

WORKDIR /app/boltz
# We must ensure we install a PyTorch version that explicitly supports CUDA 12 
# We also downgrade numpy because Numba is fundamentally incompatible with NumPy 2.2+
# Finally, we must install nvidia-cuda-toolkit since we bypassed the default PyTorch bundle installer
RUN uv pip install --system -e .[cuda] \
    && uv pip install --system --upgrade "torch>=2.0.0" "pytorch-lightning>=2.0.0" "numpy<2.1.0" --index-url https://download.pytorch.org/whl/cu121 \
    && apt-get update && apt-get install -y nvidia-cuda-toolkit build-essential gcc g++ && rm -rf /var/lib/apt/lists/*

# Fix Triton GCC path for nvidia stubs. The 'cuda-compat' package actually provides
# the raw stub files needed for compilation that the standard toolkit misses.
# We also pin the exact nvidia driver compat layer to match the GKE host driver 550+
RUN apt-get update && apt-get install -y cuda-compat-12-1 && rm -rf /var/lib/apt/lists/*
ENV LD_LIBRARY_PATH=/usr/local/nvidia/lib64:/usr/local/cuda/compat:${LD_LIBRARY_PATH}

# Install KFP for Vertex Pipelines (optional inside container, but good to have)
RUN uv pip install --system kfp google-cloud-aiplatform

COPY run.sh /app/run.sh
RUN chmod +x /app/run.sh

ENTRYPOINT ["/app/run.sh"]
