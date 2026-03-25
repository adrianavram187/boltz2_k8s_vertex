#!/bin/bash
set -e

PROJECT_ID="YOUR_PROJECT_ID_HERE"
IMAGE_NAME="ml-ui"
IMAGE_TAG="latest"

FULL_IMAGE_URI="gcr.io/${PROJECT_ID}/${IMAGE_NAME}:${IMAGE_TAG}"

gcloud auth configure-docker gcr.io
docker build --platform linux/amd64 -t $FULL_IMAGE_URI .
docker push $FULL_IMAGE_URI

kubectl rollout restart deployment ml-ui -n default || true
echo "UI Deployment complete."