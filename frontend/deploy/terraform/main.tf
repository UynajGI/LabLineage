terraform {
  required_version = ">= 1.7.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.30"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  database_name = "lablineage"
  runtime_role  = "lablineage_app"
  owner_role    = "lablineage_owner"
  required_apis = toset([
    "artifactregistry.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com"
  ])
  runtime_database_url = "postgresql://${local.runtime_role}:${urlencode(random_password.runtime_database.result)}@/${local.database_name}?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
  owner_database_url   = "postgresql://${local.owner_role}:${urlencode(random_password.owner_database.result)}@/${local.database_name}?host=/cloudsql/${google_sql_database_instance.postgres.connection_name}"
}

resource "google_project_service" "required" {
  for_each           = local.required_apis
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "guardian" {
  location      = var.region
  repository_id = var.artifact_repository_id
  description   = "Immutable LabLineage Guardian container images"
  format        = "DOCKER"
  depends_on    = [google_project_service.required]

  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "2592000s"
    }
  }
  cleanup_policies {
    id     = "keep-release-images"
    action = "KEEP"
    most_recent_versions {
      keep_count = 30
    }
  }
}

resource "google_service_account" "github_deployer" {
  count        = var.enable_github_deploy ? 1 : 0
  account_id   = "lablineage-github-deploy"
  display_name = "LabLineage GitHub deployment identity"
}

resource "google_project_iam_member" "github_deployer_run_admin" {
  count   = var.enable_github_deploy ? 1 : 0
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_deployer[0].email}"
}

resource "google_artifact_registry_repository_iam_member" "github_deployer_writer" {
  count      = var.enable_github_deploy ? 1 : 0
  project    = var.project_id
  location   = google_artifact_registry_repository.guardian.location
  repository = google_artifact_registry_repository.guardian.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_deployer[0].email}"
}

resource "google_iam_workload_identity_pool" "github" {
  count                     = var.enable_github_deploy ? 1 : 0
  workload_identity_pool_id = "lablineage-github"
  display_name              = "LabLineage GitHub Actions"
  description               = "OIDC trust restricted to the configured LabLineage repository"
  depends_on                = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count                              = var.enable_github_deploy ? 1 : 0
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions"
  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
  }
  attribute_condition = "assertion.repository == '${var.github_repository}'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_workload_identity" {
  count              = var.enable_github_deploy ? 1 : 0
  service_account_id = google_service_account.github_deployer[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_repository}"
}

resource "random_password" "runtime_database" {
  length  = 32
  special = false
}

resource "random_password" "owner_database" {
  length  = 32
  special = false
}

resource "google_service_account" "runtime" {
  account_id   = "lablineage-runtime"
  display_name = "LabLineage Guardian runtime"
}

resource "google_service_account" "migration" {
  account_id   = "lablineage-migration"
  display_name = "LabLineage Guardian migration job"
}

resource "google_project_iam_member" "runtime_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "migration_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migration.email}"
}

resource "google_service_account_iam_member" "github_deployer_act_as_runtime" {
  count              = var.enable_github_deploy ? 1 : 0
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer[0].email}"
}

resource "google_service_account_iam_member" "github_deployer_act_as_migration" {
  count              = var.enable_github_deploy ? 1 : 0
  service_account_id = google_service_account.migration.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer[0].email}"
}

resource "google_sql_database_instance" "postgres" {
  name                = "lablineage-pg"
  database_version    = "POSTGRES_17"
  region              = var.region
  deletion_protection = var.deletion_protection
  depends_on          = [google_project_service.required]

  settings {
    tier              = var.database_tier
    availability_type = var.database_high_availability ? "REGIONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.database_disk_size_gb
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    insights_config {
      query_insights_enabled  = true
      query_plans_per_minute  = 5
      query_string_length     = 1024
      record_application_tags = true
    }

    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }
  }
}

resource "google_sql_database" "lablineage" {
  name     = local.database_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "runtime" {
  name     = local.runtime_role
  instance = google_sql_database_instance.postgres.name
  password = random_password.runtime_database.result
}

resource "google_sql_user" "owner" {
  name     = local.owner_role
  instance = google_sql_database_instance.postgres.name
  password = random_password.owner_database.result
}

resource "google_secret_manager_secret" "runtime_database_url" {
  secret_id = "lablineage-runtime-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "runtime_database_url" {
  secret      = google_secret_manager_secret.runtime_database_url.id
  secret_data = local.runtime_database_url
}

resource "google_secret_manager_secret" "owner_database_url" {
  secret_id = "lablineage-owner-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "owner_database_url" {
  secret      = google_secret_manager_secret.owner_database_url.id
  secret_data = local.owner_database_url
}

resource "google_secret_manager_secret" "github_app_key" {
  secret_id = "lablineage-github-app-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "workspace_oauth" {
  secret_id = "lablineage-workspace-oauth"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "model_api_key" {
  count     = var.google_genai_api_key == null ? 0 : 1
  secret_id = "lablineage-google-genai-api-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "model_api_key" {
  count       = var.google_genai_api_key == null ? 0 : 1
  secret      = google_secret_manager_secret.model_api_key[0].id
  secret_data = var.google_genai_api_key
}

resource "google_secret_manager_secret_iam_member" "runtime_database" {
  secret_id = google_secret_manager_secret.runtime_database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "migration_database" {
  secret_id = google_secret_manager_secret.owner_database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migration.email}"
}

resource "google_secret_manager_secret_iam_member" "runtime_model_key" {
  count     = var.google_genai_api_key == null ? 0 : 1
  secret_id = google_secret_manager_secret.model_api_key[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket" "bundles" {
  name                        = "${var.project_id}-lablineage-bundles"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning { enabled = true }
  retention_policy {
    retention_period = 2592000
    is_locked        = false
  }
  lifecycle_rule {
    action { type = "Delete" }
    condition { age = var.object_lifecycle_days }
  }
  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "runtime_object_creator" {
  bucket = google_storage_bucket.bundles.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket_iam_member" "runtime_object_viewer" {
  bucket = google_storage_bucket.bundles.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service" "guardian" {
  name                = "lablineage-guardian"
  location            = var.region
  deletion_protection = var.deletion_protection
  ingress             = "INGRESS_TRAFFIC_ALL"
  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_version.runtime_database_url,
    google_storage_bucket_iam_member.runtime_object_creator,
    google_storage_bucket_iam_member.runtime_object_viewer
  ]

  template {
    service_account                  = google_service_account.runtime.email
    timeout                          = "300s"
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }

    containers {
      image = var.image

      ports { container_port = 8788 }
      resources {
        limits   = { cpu = "1", memory = "1Gi" }
        cpu_idle = true
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "8788"
      }
      env {
        name  = "LABLINEAGE_TENANT_ID"
        value = var.tenant_id
      }
      env {
        name  = "LABLINEAGE_TENANT_SLUG"
        value = var.tenant_slug
      }
      env {
        name  = "LABLINEAGE_TENANT_NAME"
        value = var.tenant_name
      }
      env {
        name  = "LABLINEAGE_AUTH_MODE"
        value = "oidc"
      }
      env {
        name  = "LABLINEAGE_OIDC_ISSUER"
        value = var.oidc_issuer
      }
      env {
        name  = "LABLINEAGE_OIDC_AUDIENCE"
        value = var.oidc_audience
      }
      env {
        name  = "LABLINEAGE_OIDC_JWKS_URL"
        value = var.oidc_jwks_url
      }
      env {
        name  = "LABLINEAGE_OIDC_CLIENT_ID"
        value = var.oidc_client_id
      }
      env {
        name  = "LABLINEAGE_OIDC_AUTHORIZATION_ENDPOINT"
        value = var.oidc_authorization_endpoint
      }
      env {
        name  = "LABLINEAGE_OIDC_TOKEN_ENDPOINT"
        value = var.oidc_token_endpoint
      }
      env {
        name  = "LABLINEAGE_OIDC_REDIRECT_URI"
        value = var.oidc_redirect_uri
      }
      env {
        name  = "LABLINEAGE_REQUIRE_SIGNED_MANIFESTS"
        value = "true"
      }
      env {
        name  = "LABLINEAGE_TRUSTED_COLLECTOR_KEYS"
        value = var.trusted_collector_fingerprints
      }
      env {
        name  = "LABLINEAGE_MODEL"
        value = var.model
      }
      env {
        name  = "LABLINEAGE_OBJECT_STORE"
        value = "gcs"
      }
      env {
        name  = "LABLINEAGE_GCS_BUCKET"
        value = google_storage_bucket.bundles.name
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      dynamic "env" {
        for_each = var.otel_traces_endpoint == null ? [] : [var.otel_traces_endpoint]
        content {
          name  = "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"
          value = env.value
        }
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime_database_url.secret_id
            version = "latest"
          }
        }
      }
      dynamic "env" {
        for_each = var.google_genai_api_key == null ? [] : [1]
        content {
          name = "GOOGLE_GENAI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.model_api_key[0].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        initial_delay_seconds = 5
        timeout_seconds       = 5
        period_seconds        = 5
        failure_threshold     = 20
        http_get {
          path = "/api/ready"
          port = 8788
        }
      }
      liveness_probe {
        timeout_seconds   = 5
        period_seconds    = 30
        failure_threshold = 3
        http_get {
          path = "/api/health"
          port = 8788
        }
      }
    }
  }
}

resource "google_cloud_run_v2_job" "provision" {
  name                = "lablineage-provision"
  location            = var.region
  deletion_protection = var.deletion_protection
  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_version.owner_database_url
  ]

  template {
    template {
      service_account = google_service_account.migration.email
      timeout         = "1800s"
      max_retries     = 1
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.postgres.connection_name]
        }
      }
      containers {
        image   = var.image
        command = ["npm"]
        args    = ["run", "provision", "--workspace", "backend"]
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
        env {
          name  = "LABLINEAGE_TENANT_ID"
          value = var.tenant_id
        }
        env {
          name  = "LABLINEAGE_TENANT_SLUG"
          value = var.tenant_slug
        }
        env {
          name  = "LABLINEAGE_TENANT_NAME"
          value = var.tenant_name
        }
        env {
          name  = "LABLINEAGE_RUNTIME_DB_ROLE"
          value = local.runtime_role
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.owner_database_url.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "invoker" {
  for_each = toset(var.invoker_members)
  project  = var.project_id
  location = google_cloud_run_v2_service.guardian.location
  name     = google_cloud_run_v2_service.guardian.name
  role     = "roles/run.invoker"
  member   = each.value
}
