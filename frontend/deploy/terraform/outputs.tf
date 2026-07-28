output "guardian_service_uri" {
  value = google_cloud_run_v2_service.guardian.uri
}

output "provision_job_name" {
  value = google_cloud_run_v2_job.provision.name
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "bundle_bucket" {
  value = google_storage_bucket.bundles.name
}

output "artifact_repository" {
  value = google_artifact_registry_repository.guardian.repository_id
}

output "github_workload_identity_provider" {
  value = var.enable_github_deploy ? google_iam_workload_identity_pool_provider.github[0].name : null
}

output "github_deploy_service_account" {
  value = var.enable_github_deploy ? google_service_account.github_deployer[0].email : null
}

output "post_apply_command" {
  value = "gcloud run jobs execute ${google_cloud_run_v2_job.provision.name} --region ${var.region} --wait"
}
