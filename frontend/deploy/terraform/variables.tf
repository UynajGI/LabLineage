variable "project_id" {
  description = "Google Cloud project ID."
  type        = string
}

variable "region" {
  description = "Google Cloud region."
  type        = string
  default     = "asia-east1"
}

variable "image" {
  description = "Immutable Guardian image reference, preferably pinned by digest."
  type        = string
}

variable "artifact_repository_id" {
  description = "Artifact Registry Docker repository used by the deployment workflow."
  type        = string
  default     = "lablineage"
}

variable "enable_github_deploy" {
  description = "Provision a least-privilege GitHub OIDC deployment identity."
  type        = bool
  default     = false
}

variable "github_repository" {
  description = "Exact owner/repository allowed to exchange GitHub OIDC tokens, for example UynajGI/LabLineage."
  type        = string
  default     = null
  validation {
    condition = (
      !var.enable_github_deploy
      || (var.github_repository != null && can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository)))
    )
    error_message = "github_repository must be owner/repository when enable_github_deploy is true."
  }
}

variable "tenant_id" {
  description = "Preallocated tenant UUID used by PostgreSQL RLS."
  type        = string
  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.tenant_id))
    error_message = "tenant_id must be a UUID."
  }
}

variable "tenant_slug" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9]+(?:-[a-z0-9]+)*$", var.tenant_slug))
    error_message = "tenant_slug must be a lowercase slug."
  }
}

variable "tenant_name" {
  type = string
}

variable "oidc_issuer" { type = string }
variable "oidc_audience" { type = string }
variable "oidc_jwks_url" { type = string }
variable "oidc_client_id" { type = string }
variable "oidc_authorization_endpoint" { type = string }
variable "oidc_token_endpoint" { type = string }
variable "oidc_redirect_uri" { type = string }

variable "trusted_collector_fingerprints" {
  description = "Optional comma-separated SHA-256 SPKI fingerprints for the legacy global Manifest endpoint. Project-paired Collectors register keys dynamically."
  type        = string
  default     = ""
}

variable "google_genai_api_key_secret_id" {
  description = "Optional existing Secret Manager secret ID containing a Gemini API key. Leave null to use Vertex AI ADC."
  type        = string
  default     = null
}

variable "google_genai_api_key_secret_version" {
  description = "Version of the existing Gemini key secret to inject. Pin a numeric version for controlled releases."
  type        = string
  default     = "latest"
}

variable "use_vertex_ai" {
  description = "Use Vertex AI with the runtime service account and Application Default Credentials."
  type        = bool
  default     = true
}

variable "github_app_id" {
  description = "GitHub App ID used for read-only repository collection."
  type        = string
  default     = null
}

variable "github_app_installation_id" {
  description = "GitHub App installation ID selected for this deployment."
  type        = string
  default     = null
}

variable "github_app_private_key_secret_version" {
  description = "Existing version in the Terraform-created lablineage-github-app-key secret. Terraform never receives the private key value."
  type        = string
  default     = "latest"
}

variable "analysis_queue_name" {
  description = "Cloud Tasks queue for durable automatic project analysis."
  type        = string
  default     = "lablineage-analysis"
}

variable "analysis_worker_url" {
  description = "Canonical HTTPS URL for the Cloud Run worker endpoint, ending in /internal/analysis-worker."
  type        = string
  validation {
    condition     = can(regex("^https://.+/internal/analysis-worker$", var.analysis_worker_url))
    error_message = "analysis_worker_url must be an HTTPS URL ending in /internal/analysis-worker."
  }
}

variable "model" {
  type    = string
  default = "gemini-2.5-flash"
}

variable "otel_traces_endpoint" {
  type    = string
  default = null
}

variable "database_tier" {
  type    = string
  default = "db-custom-2-7680"
}

variable "database_disk_size_gb" {
  type    = number
  default = 50
}

variable "database_high_availability" {
  type    = bool
  default = true
}

variable "min_instances" {
  type    = number
  default = 1
}

variable "max_instances" {
  type    = number
  default = 10
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "object_lifecycle_days" {
  description = "Days to retain immutable report and Bundle objects before lifecycle deletion."
  type        = number
  default     = 365
  validation {
    condition     = var.object_lifecycle_days >= 30
    error_message = "object_lifecycle_days must be at least the 30-day bucket retention period."
  }
}

variable "invoker_members" {
  description = "Cloud Run invokers. Browser PKCE deployments normally use allUsers at this layer and rely on the application's OIDC protection for /v1; private services require an authenticated proxy or load balancer."
  type        = list(string)
  default     = []
}
