#!/usr/bin/env bash
set -euo pipefail

namespace="${1:-trading-platform}"
api_image="${2:?api image is required}"
web_image="${3:?web image is required}"
admin_image="${4:?admin image is required}"
canary_percent="${5:?canary percent is required}"
api_gsa_email="${API_GSA_EMAIL:?API_GSA_EMAIL is required}"
cloud_sql_instance_connection_name="${CLOUD_SQL_INSTANCE_CONNECTION_NAME:?CLOUD_SQL_INSTANCE_CONNECTION_NAME is required}"
secret_manager_project_id="${SECRET_MANAGER_PROJECT_ID:?SECRET_MANAGER_PROJECT_ID is required}"
database_url_secret_name="${DATABASE_URL_SECRET_NAME:?DATABASE_URL_SECRET_NAME is required}"
password_pepper_secret_name="${PASSWORD_PEPPER_SECRET_NAME:?PASSWORD_PEPPER_SECRET_NAME is required}"
bootstrap_admin_password_secret_name="${BOOTSTRAP_ADMIN_PASSWORD_SECRET_NAME:?BOOTSTRAP_ADMIN_PASSWORD_SECRET_NAME is required}"
bootstrap_trader_password_secret_name="${BOOTSTRAP_TRADER_PASSWORD_SECRET_NAME:?BOOTSTRAP_TRADER_PASSWORD_SECRET_NAME is required}"

if ! [[ "${canary_percent}" =~ ^[0-9]+$ ]] || (( canary_percent <= 0 )) || (( canary_percent >= 100 )); then
  echo "canary_percent must be an integer between 1 and 99" >&2
  exit 1
fi

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

render_manifest() {
  local api_stable_image="$1"
  local api_canary_image="$2"
  local api_stable_weight="$3"
  local api_canary_weight="$4"
  local api_canary_replicas="$5"
  local web_stable_image="$6"
  local web_canary_image="$7"
  local web_stable_weight="$8"
  local web_canary_weight="$9"
  local web_canary_replicas="${10}"
  local admin_stable_image="${11}"
  local admin_canary_image="${12}"
  local admin_stable_weight="${13}"
  local admin_canary_weight="${14}"
  local admin_canary_replicas="${15}"

  python "${render_script}" \
    --template "${template_path}" \
    --output "${rendered_manifest}" \
    --value "API_STABLE_IMAGE=${api_stable_image}" \
    --value "API_CANARY_IMAGE=${api_canary_image}" \
    --value "API_STABLE_WEIGHT=${api_stable_weight}" \
    --value "API_CANARY_WEIGHT=${api_canary_weight}" \
    --value "API_CANARY_REPLICAS=${api_canary_replicas}" \
    --value "API_GSA_EMAIL=${api_gsa_email}" \
    --value "CLOUD_SQL_INSTANCE_CONNECTION_NAME=${cloud_sql_instance_connection_name}" \
    --value "SECRET_MANAGER_PROJECT_ID=${secret_manager_project_id}" \
    --value "DATABASE_URL_SECRET_NAME=${database_url_secret_name}" \
    --value "PASSWORD_PEPPER_SECRET_NAME=${password_pepper_secret_name}" \
    --value "BOOTSTRAP_ADMIN_PASSWORD_SECRET_NAME=${bootstrap_admin_password_secret_name}" \
    --value "BOOTSTRAP_TRADER_PASSWORD_SECRET_NAME=${bootstrap_trader_password_secret_name}" \
    --value "WEB_STABLE_IMAGE=${web_stable_image}" \
    --value "WEB_CANARY_IMAGE=${web_canary_image}" \
    --value "WEB_STABLE_WEIGHT=${web_stable_weight}" \
    --value "WEB_CANARY_WEIGHT=${web_canary_weight}" \
    --value "WEB_CANARY_REPLICAS=${web_canary_replicas}" \
    --value "ADMIN_STABLE_IMAGE=${admin_stable_image}" \
    --value "ADMIN_CANARY_IMAGE=${admin_canary_image}" \
    --value "ADMIN_STABLE_WEIGHT=${admin_stable_weight}" \
    --value "ADMIN_CANARY_WEIGHT=${admin_canary_weight}" \
    --value "ADMIN_CANARY_REPLICAS=${admin_canary_replicas}"
}

smoke_service() {
  local service_name="$1"
  local local_port="$2"
  local remote_port="$3"
  local path="$4"
  local expected_substring="${5:-}"
  local log_file
  log_file="$(mktemp)"

  kubectl -n "${namespace}" port-forward "service/${service_name}" "${local_port}:${remote_port}" > "${log_file}" 2>&1 &
  local port_forward_pid=$!

  local attempt
  for attempt in $(seq 1 60); do
    if curl --fail --silent --show-error "http://127.0.0.1:${local_port}${path}" > "${log_file}.response" 2> /dev/null; then
      if [[ -z "${expected_substring}" ]] || grep --fixed-strings --quiet "${expected_substring}" "${log_file}.response"; then
        kill "${port_forward_pid}" 2> /dev/null || true
        wait "${port_forward_pid}" 2> /dev/null || true
        rm -f "${log_file}" "${log_file}.response"
        return 0
      fi
    fi

    sleep 5
  done

  kill "${port_forward_pid}" 2> /dev/null || true
  wait "${port_forward_pid}" 2> /dev/null || true
  echo "Smoke test failed for ${service_name}" >&2
  cat "${log_file}" >&2 || true
  rm -f "${log_file}" "${log_file}.response"
  exit 1
}

api_stable_image="$(current_image api-stable)"
web_stable_image="$(current_image web-stable)"
admin_stable_image="$(current_image admin-stable)"

api_canary_enabled=1
web_canary_enabled=1
admin_canary_enabled=1

if [[ -z "${api_stable_image}" ]]; then
  api_stable_image="${api_image}"
  api_canary_enabled=0
fi

if [[ -z "${web_stable_image}" ]]; then
  web_stable_image="${web_image}"
  web_canary_enabled=0
fi

if [[ -z "${admin_stable_image}" ]]; then
  admin_stable_image="${admin_image}"
  admin_canary_enabled=0
fi

api_canary_replicas="${api_canary_enabled}"
web_canary_replicas="${web_canary_enabled}"
admin_canary_replicas="${admin_canary_enabled}"

echo "Applying baseline GKE manifests with canary traffic pinned to 0%"
render_manifest \
  "${api_stable_image}" "${api_image}" "100" "0" "${api_canary_replicas}" \
  "${web_stable_image}" "${web_image}" "100" "0" "${web_canary_replicas}" \
  "${admin_stable_image}" "${admin_image}" "100" "0" "${admin_canary_replicas}"
kubectl apply -f "${rendered_manifest}"

kubectl -n "${namespace}" rollout status deployment/api-stable --timeout=10m
kubectl -n "${namespace}" rollout status deployment/web-stable --timeout=10m
kubectl -n "${namespace}" rollout status deployment/admin-stable --timeout=10m

if (( api_canary_enabled == 1 )); then
  kubectl -n "${namespace}" rollout status deployment/api-canary --timeout=10m
  smoke_service api-canary 14000 4000 /ready '"ok":true'
fi

if (( web_canary_enabled == 1 )); then
  kubectl -n "${namespace}" rollout status deployment/web-canary --timeout=10m
  smoke_service web-canary 15080 80 /
fi

if (( admin_canary_enabled == 1 )); then
  kubectl -n "${namespace}" rollout status deployment/admin-canary --timeout=10m
  smoke_service admin-canary 16080 80 /
fi

api_stable_weight=$(( api_canary_enabled == 1 ? 100 - canary_percent : 100 ))
api_canary_weight=$(( api_canary_enabled == 1 ? canary_percent : 0 ))
web_stable_weight=$(( web_canary_enabled == 1 ? 100 - canary_percent : 100 ))
web_canary_weight=$(( web_canary_enabled == 1 ? canary_percent : 0 ))
admin_stable_weight=$(( admin_canary_enabled == 1 ? 100 - canary_percent : 100 ))
admin_canary_weight=$(( admin_canary_enabled == 1 ? canary_percent : 0 ))

echo "Shifting live traffic to canary services"
render_manifest \
  "${api_stable_image}" "${api_image}" "${api_stable_weight}" "${api_canary_weight}" "${api_canary_replicas}" \
  "${web_stable_image}" "${web_image}" "${web_stable_weight}" "${web_canary_weight}" "${web_canary_replicas}" \
  "${admin_stable_image}" "${admin_image}" "${admin_stable_weight}" "${admin_canary_weight}" "${admin_canary_replicas}"
kubectl apply -f "${rendered_manifest}"

kubectl -n "${namespace}" get httproute public-route admin-route
