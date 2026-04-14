#!/usr/bin/env bash
set -euo pipefail

project_id="${1:?project_id is required}"
region="${2:?region is required}"
service="${3:?service is required}"

echo "Promoting latest ready revision for ${service} to 100% traffic"
gcloud run services update-traffic "${service}" \
  --project "${project_id}" \
  --region "${region}" \
  --to-latest

echo "Removing canary tag for ${service}"
gcloud run services update-traffic "${service}" \
  --project "${project_id}" \
  --region "${region}" \
  --remove-tags canary
