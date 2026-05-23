FROM us-docker.pkg.dev/vertex-ai/training/pytorch-gpu.2-4.py310:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl apt-transport-https ca-certificates gnupg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN git clone https://github.com/jwohlwend/boltz.git /app/boltz
WORKDIR /app/boltz

RUN pip freeze | grep -E "^(torch|torchvision|torchaudio|triton)" > /tmp/version_pins.txt \
    && pip install -c /tmp/version_pins.txt -e .

RUN pip install kfp google-cloud-aiplatform

COPY run.sh /app/run.sh
RUN chmod +x /app/run.sh

ENTRYPOINT ["/app/run.sh"]
