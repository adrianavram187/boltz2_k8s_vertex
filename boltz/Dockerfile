FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Added aria2 (required by colabfold) and mdadm/lsblk (to manage Local SSDs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3-pip python3.10-dev libpython3.10-dev curl \
    apt-transport-https ca-certificates gnupg build-essential \
    cmake aria2 mdadm util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install uv

# Install Google Cloud CLI
RUN curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update && apt-get install -y --no-install-recommends google-cloud-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install MMseqs2 (GPU enabled version)
RUN curl -L https://mmseqs.com/latest/mmseqs-linux-gpu.tar.gz | tar xzvf - \
    && mv mmseqs/bin/mmseqs /usr/local/bin/

# Clone and install Boltz & Colabfold
RUN git clone https://github.com/jwohlwend/boltz.git /app/boltz
WORKDIR /app/boltz

# Install Boltz, Colabfold, and specific CUDA-friendly dependencies
RUN uv pip install --system -e .[cuda] \
    && uv pip install --system colabfold \
    && uv pip install --system --upgrade "torch>=2.0.0" "numpy<2.1.0" --index-url https://download.pytorch.org/whl/cu121 \
    && apt-get update && apt-get install -y nvidia-cuda-toolkit && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y cuda-compat-12-1 && rm -rf /var/lib/apt/lists/*
ENV LD_LIBRARY_PATH=/usr/local/nvidia/lib64:/usr/local/cuda/compat:${LD_LIBRARY_PATH}

# Install Pipeline SDKs
RUN uv pip install --system kfp google-cloud-aiplatform

COPY run.sh /app/run.sh
RUN chmod +x /app/run.sh

ENTRYPOINT ["/app/run.sh"]