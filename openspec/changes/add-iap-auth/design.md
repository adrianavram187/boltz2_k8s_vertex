## Context

The ML HPC platform currently uses raw TCP LoadBalancers to expose the React UI (`ml-ui-service`). This means the application is accessible to anyone on the internet who knows the IP address. To secure access to authorized organization members, we need to implement Identity-Aware Proxy (IAP). IAP requires an HTTP(S) Load Balancer (Application Load Balancer) in Google Cloud, which means we must migrate from raw L4 LoadBalancers to L7 LoadBalancers via Kubernetes Ingress.

## Goals / Non-Goals

**Goals:**
- Secure the `ml-ui` and `ml-job-api` behind Google Cloud Identity-Aware Proxy (IAP).
- Restrict access to specific IAM users/groups.
- Automate the infrastructure provisioning using Terraform.
- Migrate Kubernetes Services from `type: LoadBalancer` to `type: NodePort` + `Ingress` (GCE Ingress Controller).

**Non-Goals:**
- Implementing custom login pages or JWT generation inside the FastAPI application.
- Supporting non-Google authentication providers (we will strictly use Google Workspace/Cloud Identity via IAP).

## Decisions

**1. Use GKE Ingress (Application Load Balancer) instead of NGINX Ingress**
- *Rationale:* IAP integrates natively and seamlessly with Google Cloud's Application Load Balancers. The GKE Ingress controller automatically provisions these ALBs based on standard Kubernetes `Ingress` resources.
- *Alternatives:* Using NGINX ingress with a custom OAuth2 proxy sidecar. This is much more complex to manage and doesn't leverage GCP's native zero-trust infrastructure.

**2. Provision IAP Infrastructure via Terraform**
- *Rationale:* Ensures reproducible deployments. We will need to configure an OAuth brand (consent screen), OAuth Client ID, and IAM bindings for `roles/iap.httpsResourceAccessor`.

**3. Backend JWT Validation (Defense-in-Depth)**
- *Rationale:* While IAP secures the perimeter, the backend should ideally validate the `X-Goog-IAP-JWT-Assertion` header to ensure requests haven't bypassed the load balancer (e.g., from within the cluster). We will add a FastAPI middleware to validate this JWT.

## Risks / Trade-offs

- **Risk: OAuth Brand Restrictions** → Creating an OAuth consent screen via Terraform (`google_iap_brand`) can sometimes fail if the GCP organization is not configured correctly or if it's an internal-only brand.
  - *Mitigation:* We will document that the OAuth brand might need to be created manually once in the GCP console if the organization policy blocks programmatic creation.
- **Risk: Ingress Provisioning Time** → GCE Ingress can take 5-10 minutes to provision the external HTTP(S) Load Balancer and health checks.
  - *Mitigation:* Document this delay in the README so users don't think the deployment has failed.
- **Risk: SSL Certificates** → IAP requires HTTPS. 
  - *Mitigation:* We will use Google-managed SSL certificates (`ManagedCertificate` custom resource in K8s) mapped to a nip.io domain or require the user to provide a domain. To keep things simple and zero-config for new deployments, we will use a self-signed cert or `nip.io` with a Google-managed cert if possible. *(Decision: Use Google Managed Certs requiring a domain, or document how to use it with a static IP).*