## Why

We need to secure our ML High-Performance Computing platform (Boltz-2) to ensure only authorized users within the organization can access the UI and the backend APIs. By adding Identity-Aware Proxy (IAP) authentication, we can enforce zero-trust access controls without having to build custom authentication logic into the FastAPI backend or React UI.

## What Changes

- Enable Google Cloud Identity-Aware Proxy (IAP) on the external HTTP(S) Load Balancers exposing the services.
- Update Terraform configuration to provision necessary IAP resources (OAuth brand, clients, backend backend service IAP configurations, IAM bindings).
- Update the Kubernetes Ingress/Service configurations if necessary to integrate with a Google Cloud Application Load Balancer instead of the default raw TCP LoadBalancer.
- Configure backend services (FastAPI and UI) to optionally validate the IAP JWT tokens for defense-in-depth.

## Capabilities

### New Capabilities
- `iap-authentication`: Configure and enforce Google Cloud Identity-Aware Proxy for secure, identity-based access to platform services.

### Modified Capabilities

## Impact

- **Infrastructure**: Terraform code (`terraform/main.tf` or new `iap.tf`) will be significantly updated to provision IAP and HTTP(S) Load Balancing resources.
- **Networking**: Kubernetes Services will need to switch from raw `LoadBalancer` to `NodePort` with an `Ingress` resource mapped to a GCP HTTP(S) Load Balancer for IAP support.
- **FastAPI Backend**: May require new middleware to validate `X-Goog-IAP-JWT-Assertion` headers.
- **React UI**: Might need updates to pass through credentials if making cross-origin requests, though IAP typically handles this transparently at the load balancer level.