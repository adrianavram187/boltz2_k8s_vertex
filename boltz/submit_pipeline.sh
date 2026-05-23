#!/bin/bash
set -e

# Configuration
# Load .env from root if it exists
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
fi

if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: PROJECT_ID environment variable is not set. Please set it in ../.env or export it."
    exit 1
fi

export REGION="us-central1"
IMAGE_NAME="boltz-runner"
IMAGE_TAG="latest"

echo "Using Project ID: $PROJECT_ID"

# 1. Configure Docker authentication for GCR
gcloud config set project $PROJECT_ID
gcloud auth configure-docker gcr.io

# 2. Build the Docker Image for AMD64
FULL_IMAGE_URI="gcr.io/${PROJECT_ID}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "Building image: $FULL_IMAGE_URI"
docker build --platform linux/amd64 -t $FULL_IMAGE_URI .

# 3. Push the image to Google Container Registry (GCR)
echo "Pushing image to GCR..."
docker push $FULL_IMAGE_URI

# 4. Compile the Vertex Pipeline definition
echo "Compiling the Vertex AI Pipeline (boltz_pipeline.yaml)..."
# We run the python script to generate the .yaml pipeline definition
python3 pipeline.py

echo ""
echo "Pipeline setup complete!"
echo "The boltz_pipeline.yaml file has been generated."
echo "Your FastAPI app can now submit this pipeline directly to Vertex AI."
