#!/bin/bash
# LabLineage Guardian - GCP Bootstrap Script
# Run this script in Cloud Shell to provision the required infrastructure.

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"

echo "===================================================="
echo "Bootstrapping LabLineage Guardian in $PROJECT_ID"
echo "===================================================="

echo "1. Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  iamcredentials.googleapis.com

echo "2. Creating Service Accounts..."
gcloud iam service-accounts create ll-web-sa --display-name="LabLineage Web BFF" || true
gcloud iam service-accounts create ll-agent-sa --display-name="LabLineage Guardian Agent" || true
gcloud iam service-accounts create ll-workspace-sa --display-name="LabLineage Workspace Adapter" || true

echo "3. Creating Storage Buckets..."
gcloud storage buckets create gs://$PROJECT_ID-lablineage-bundles --location=$REGION \
  --uniform-bucket-level-access --public-access-prevention || true

echo "4. Creating Secret Manager Secrets (Placeholders)..."
gcloud secrets create github-app-key --replication-policy="automatic" || true
gcloud secrets create workspace-oauth-secret --replication-policy="automatic" || true

echo "===================================================="
echo "Bootstrap complete."
echo "Next steps:"
echo "1. Upload your GitHub App private key to Secret Manager: github-app-key"
echo "2. Run Terraform to provision Cloud SQL and Cloud Run services."
echo "===================================================="
