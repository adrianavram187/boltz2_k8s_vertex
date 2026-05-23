#!/bin/bash
set -e

# Load .env from root if it exists
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
fi

if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: PROJECT_ID environment variable is not set. Please set it in ../.env or export it."
    exit 1
fi

IMAGE_NAME="fastapi-app"
IMAGE_TAG="latest"

FULL_IMAGE_URI="gcr.io/${PROJECT_ID}/${IMAGE_NAME}:${IMAGE_TAG}"

gcloud auth configure-docker gcr.io

# Copy the compiled Vertex AI pipeline yaml into the FastAPI app context
if [ ! -f "../boltz/boltz_pipeline.yaml" ]; then
    echo "ERROR: ../boltz/boltz_pipeline.yaml not found!"
    echo "Please go to the ../boltz directory and run 'python3 pipeline.py' first."
    exit 1
fi
cp ../boltz/boltz_pipeline.yaml .

docker build --platform linux/amd64 -t $FULL_IMAGE_URI .
docker push $FULL_IMAGE_URI

kubectl rollout restart deployment ml-job-api -n default 2>/dev/null || echo "Deployment not found. It will be created when you run kubectl apply."
echo "Build and push complete."
