#!/bin/bash
set -e

echo "Downloading Kueue manifests..."
curl -s -L https://github.com/kubernetes-sigs/kueue/releases/download/v0.7.0/manifests.yaml > kueue-manifests.yaml

echo "Fixing broken Google Cloud Registry image reference for kube-rbac-proxy..."
sed -i '' 's|gcr.io/kubebuilder/kube-rbac-proxy:v0.8.0|quay.io/brancz/kube-rbac-proxy:v0.15.0|g' kueue-manifests.yaml

echo "Installing Kueue version v0.7.0..."
kubectl apply --server-side -f kueue-manifests.yaml
rm kueue-manifests.yaml

echo "Waiting for Kueue controller manager to be ready..."
kubectl wait --for=condition=Available deployment/kueue-controller-manager -n kueue-system --timeout=300s

echo "Applying Kueue resources (Flavors, ClusterQueues, LocalQueues)..."
kubectl apply -f resource-flavor.yaml
kubectl apply -f cluster-queue.yaml
kubectl apply -f local-queue.yaml

echo "Kueue setup complete!"
