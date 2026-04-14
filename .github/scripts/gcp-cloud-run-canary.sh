#!/usr/bin/env bash
set -euo pipefail

project_id="${1:?project_id is required}"
region="${2:?region is required}"
service="${3:?service is required}"
image="${4:?image is required}"
canary_percent="${5:?canary_percent is required}"
smoke_path="${6:-/}"
expected_substring="${7:-}"
retry_count="${8:-60}"
retry_sleep_seconds="${9:-5}"

if ! [[ "${canary_percent}" =~ ^[0-9]+$ ]] || (( canary_percent <= 0 )) || (( canary_percent >= 100 )); then
  echo "canary_percent must be an integer between 1 and 99" >&2
  exit 1
fi

get_service_json() {
  gcloud run services describe "${service}" \
    --project "${project_id}" \
    --region "${region}" \
    --format=json
}

service_json="$(get_service_json)"

stable_revision="$(
  SERVICE_JSON="${service_json}" python - <<'PY'
import json
import os

data = json.loads(os.environ["SERVICE_JSON"])
traffic = data.get("status", {}).get("traffic", [])
live = [entry for entry in traffic if int(entry.get("percent", 0) or 0) > 0 and entry.get("revisionName")]
live.sort(key=lambda entry: int(entry.get("percent", 0) or 0), reverse=True)
print(live[0]["revisionName"] if live else "")
PY
)"

service_url="$(
  SERVICE_JSON="${service_json}" python - <<'PY'
import json
import os

data = json.loads(os.environ["SERVICE_JSON"])
print(data.get("status", {}).get("url") or data.get("uri") or "")
PY
)"

echo "Deploying ${service} canary revision with no live traffic"
gcloud run deploy "${service}" \
  --project "${project_id}" \
  --region "${region}" \
  --image "${image}" \
  --tag canary \
  --no-traffic \
  --quiet

latest_revision="$(
  gcloud run services describe "${service}" \
    --project "${project_id}" \
    --region "${region}" \
    --format='value(status.latestReadyRevisionName)'
)"

host="${service_url#https://}"
canary_url="https://canary---${host}"
smoke_url="${canary_url%/}${smoke_path}"

echo "Smoke testing ${smoke_url}"
for attempt in $(seq 1 "${retry_count}"); do
  response_file="$(mktemp)"

  if curl --fail --silent --show-error --location "${smoke_url}" --output "${response_file}"; then
    if [[ -z "${expected_substring}" ]] || grep --fixed-strings --quiet "${expected_substring}" "${response_file}"; then
      echo "Canary smoke test passed for ${service}"
      rm -f "${response_file}"
      break
    fi
  fi

  rm -f "${response_file}"

  if (( attempt == retry_count )); then
    echo "Canary smoke test failed for ${service} after ${retry_count} attempts" >&2
    exit 1
  fi

  sleep "${retry_sleep_seconds}"
done

if [[ -n "${stable_revision}" && "${stable_revision}" != "${latest_revision}" ]]; then
  stable_percent=$((100 - canary_percent))
  echo "Routing ${canary_percent}% traffic to ${latest_revision} and ${stable_percent}% to ${stable_revision}"
  gcloud run services update-traffic "${service}" \
    --project "${project_id}" \
    --region "${region}" \
    --to-revisions "${latest_revision}=${canary_percent},${stable_revision}=${stable_percent}"
else
  echo "No prior stable revision found; promoting latest revision to 100%"
  gcloud run services update-traffic "${service}" \
    --project "${project_id}" \
    --region "${region}" \
    --to-latest
fi
