#!/usr/bin/env bash
set -euo pipefail

namespace="${1:-trading-platform}"
api_gsa_email="${API_GSA_EMAIL:?API_GSA_EMAIL is required}"
cloud_sql_instance_connection_name="${CLOUD_SQL_INSTANCE_CONNECTION_NAME:?CLOUD_SQL_INSTANCE_CONNECTION_NAME is required}"
secret_manager_project_id="${SECRET_MANAGER_PROJECT_ID:?SECRET_MANAGER_PROJECT_ID is required}"
database_url_secret_name="${DATABASE_URL_SECRET_NAME:?DATABASE_URL_SECRET_NAME is required}"
password_pepper_secret_name="${PASSWORD_PEPPER_SECRET_NAME:?PASSWORD_PEPPER_SECRET_NAME is required}"
bootstrap_admin_password_secret_name="${BOOTSTRAP_ADMIN_PASSWORD_SECRET_NAME:?BOOTSTRAP_ADMIN_PASSWORD_SECRET_NAME is required}"
bootstrap_trader_password_secret_name="${BOOTSTRAP_TRADER_PASSWORD_SECRET_NAME:?BOOTSTRAP_TRADER_PASSWORD_SECRET_NAME is required}"

template_path="infra/k8s/gke/platform.yaml.tmpl"
render_script=".github/scripts/render-gke-manifests.py"
rendered_manifest="$(mktemp)"

cleanup() {
  rm -f "${rendered_manifest}"
}
trap cleanup EXIT

current_image() {
  kubectl -n "${namespace}" get deployment "$1" -o jsonpath='{.spec.template.spec.containers[0].image}' 2> /dev/null || true
}

api_stable_image="${API_STABLE_IMAGE:-$(current_image api-stable)}"
web_stable_image="${WEB_STABLE_IMAGE:-$(current_image web-stable)}"
admin_stable_image="${ADMIN_STABLE_IMAGE:-$(current_image admin-stable)}"
api_canary_image="${API_CANARY_IMAGE:-$(current_image api-canary)}"
web_canary_image="${WEB_CANARY_IMAGE:-$(current_image web-canary)}"
admin_canary_image="${ADMIN_CANARY_IMAGE:-$(current_image admin-canary)}"

api_canary_image="${api_canary_image:-$api_stable_image}"
web_canary_image="${web_canary_image:-$web_stable_image}"
admin_canary_image="${admin_canary_image:-$admin_stable_image}"

python "${render_script}" \
  --template "${template_path}" \
  --output "${rendered_manifest}" \
  --value "API_STABLE_IMAGE=${api_stable_image}" \
  --value "API_CANARY_IMAGE=${api_canary_image}" \
  --value "API_STABLE_WEIGHT=100" \
  --value "API_CANARY_WEIGHT=0" \
  --value "API_CANARY_REPLICAS=0" \
  --value "API_GSA_EMAIL=${api_gsa_email}" \
  --value "CLOUD_SQL_INSTANCE_CONNECTION_NAME=${cloud_sql_instance_connection_name}" \
  --value "SECRET_MANAGER_PROJECT_ID=${secret_manager_project_id}" \
  --value "DATABASE_URL_SECRET_NAME=${database_url_secret_name}" \
  --value "PASSWORD_PEPPER_SECRET_NAME=${password_pepper_secret_name}" \
  --value "BOOTSTRAP_ADMIN_PASSWORD_SECRET_NAME=${bootstrap_admin_password_secret_name}" \
  --value "BOOTSTRAP_TRADER_PASSWORD_SECRET_NAME=${bootstrap_trader_password_secret_name}" \
  --value "WEB_STABLE_IMAGE=${web_stable_image}" \
  --value "WEB_CANARY_IMAGE=${web_canary_image}" \
  --value "WEB_STABLE_WEIGHT=100" \
  --value "WEB_CANARY_WEIGHT=0" \
  --value "WEB_CANARY_REPLICAS=0" \
  --value "ADMIN_STABLE_IMAGE=${admin_stable_image}" \
  --value "ADMIN_CANARY_IMAGE=${admin_canary_image}" \
  --value "ADMIN_STABLE_WEIGHT=100" \
  --value "ADMIN_CANARY_WEIGHT=0" \
  --value "ADMIN_CANARY_REPLICAS=0"

kubectl apply -f "${rendered_manifest}"
kubectl -n "${namespace}" rollout status deployment/api-stable --timeout=10m
kubectl -n "${namespace}" rollout status deployment/web-stable --timeout=10m
kubectl -n "${namespace}" rollout status deployment/admin-stable --timeout=10m
