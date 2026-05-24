## 1. Infrastructure (Terraform) Updates

- [x] 1.1 Create `terraform/iap.tf` to define OAuth Brand, OAuth Client, and IAP IAM bindings.
- [x] 1.2 Update `terraform/variables.tf` to accept IAP allowed users/domains and domain name for SSL.
- [x] 1.3 Configure a Google Managed SSL Certificate resource in Terraform (or K8s Manifest).

## 2. Kubernetes Configuration Updates

- [x] 2.1 Update `k8s/app/service.yaml` and `k8s/ui/service.yaml` to change `type: LoadBalancer` to `type: NodePort`.
- [x] 2.2 Create `k8s/ingress.yaml` to define a GCE Ingress resource mapping paths to `ml-ui` and `ml-job-api`.
- [x] 2.3 Create `k8s/backendconfig.yaml` to enable IAP on the GKE backend services.

## 3. Backend Integration

- [x] 3.1 Install `google-auth` library in `fastapi-app/requirements.txt` to handle JWT validation.
- [x] 3.2 Create a FastAPI middleware/dependency in `fastapi-app/main.py` to intercept and validate `X-Goog-IAP-JWT-Assertion`.
- [x] 3.3 Apply the dependency to all protected routes in the API.

## 4. Documentation

- [x] 4.1 Update `README.md` deployment steps to explain the new IAP configuration variables.
- [x] 4.2 Document the OAuth Consent Screen limitation and manual creation step if necessary.