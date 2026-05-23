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

IMAGE_NAME="ml-ui"
IMAGE_TAG="latest"

FULL_IMAGE_URI="gcr.io/${PROJECT_ID}/${IMAGE_NAME}:${IMAGE_TAG}"

gcloud auth configure-docker gcr.io
docker build --platform linux/amd64 -t $FULL_IMAGE_URI .
docker push $FULL_IMAGE_URI

kubectl rollout restart deployment ml-ui -n default 2>/dev/null || true
echo "UI Deployment complete."