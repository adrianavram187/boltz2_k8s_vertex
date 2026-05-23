## ADDED Requirements

### Requirement: Enforce IAP on External Endpoints
The infrastructure SHALL enforce Identity-Aware Proxy (IAP) on all public-facing Application Load Balancers serving the UI and API.

#### Scenario: Unauthorized access attempt
- **WHEN** an unauthenticated user attempts to access the platform URL
- **THEN** the user is redirected to the Google login page
- **AND** access to the underlying Kubernetes pods is blocked.

#### Scenario: Authorized access attempt
- **WHEN** an authenticated user who is a member of the allowed IAM group attempts to access the platform URL
- **THEN** the user is granted access
- **AND** the Google Cloud Load Balancer passes the `X-Goog-IAP-JWT-Assertion` header to the backend pods.

### Requirement: Infrastructure Automation for IAP
The Terraform configuration MUST automatically provision required IAP resources, including the OAuth Brand, OAuth Client, Backend Services IAP enablement, and IAM role bindings.

#### Scenario: Applying Terraform from scratch
- **WHEN** a user runs `terraform apply` on a new project
- **THEN** an OAuth Client is created for IAP
- **AND** the `roles/iap.httpsResourceAccessor` role is bound to the specified users/groups
- **AND** Kubernetes is configured to use the GCE Ingress controller with IAP enabled on the BackendConfig.

### Requirement: Backend JWT Validation
The FastAPI backend SHOULD validate the IAP JWT assertion header to ensure defense-in-depth and prevent unauthorized access from within the VPC.

#### Scenario: Request missing IAP header
- **WHEN** the backend receives a request without the `X-Goog-IAP-JWT-Assertion` header
- **THEN** the backend responds with a 401 Unauthorized status.

#### Scenario: Request with invalid IAP header
- **WHEN** the backend receives a request with an invalid or expired `X-Goog-IAP-JWT-Assertion` header
- **THEN** the backend responds with a 401 Unauthorized status.

#### Scenario: Request with valid IAP header
- **WHEN** the backend receives a request with a valid `X-Goog-IAP-JWT-Assertion` header signed by Google
- **THEN** the backend processes the request normally.