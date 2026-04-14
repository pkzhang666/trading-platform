# GKE Production Runbook

## Purpose

This runbook is the production operating guide for the GKE deployment path. Use it for change review, canary rollout, promotion, rollback, and post-change evidence collection.

The GKE lane is the primary production path for the trading platform. The Cloud Run lane should be treated as a lighter-weight environment for sandbox or non-critical deployments.

## Baseline architecture

- one regional GKE cluster per environment
- Gateway API for north-south routing
- separate stable and canary Deployments and Services for `api`, `web`, and `admin`
- weighted `HTTPRoute` backend references for controlled canary traffic
- Artifact Registry for immutable images
- Cloud SQL for PostgreSQL on private IP
- Secret Manager for runtime secrets
- Cloud SQL Auth Proxy sidecar in the API pods
- GitHub Actions authenticated to GCP through Workload Identity Federation

## Required preconditions

- GitHub environment protection rules are configured for `prod`
- `GCP_PROJECT_ID` and `GCP_WORKLOAD_IDENTITY_PROVIDER` repository secrets are set
- `GCP_REGION` repository variable is set to the production region
- Terraform state backend is configured for the production environment
- DNS and TLS are planned for the `public-gateway` and `admin-gateway`
- monitoring, alerting, and log retention are configured before public launch
- Cloud SQL backup and point-in-time recovery are verified
- Secret Manager access is limited to the API workload identity

## Pre-deploy audit checklist

- confirm the change ticket, release notes, and rollback owner are recorded
- confirm Terraform plan drift is understood and reviewed
- confirm the target images are immutable and traceable to the Git commit
- confirm the cluster is healthy:
  - `kubectl get nodes`
  - `kubectl get pods -n trading-platform`
  - `kubectl get gateway,httproute -n trading-platform`
- confirm no unresolved incidents exist for matching, deposits, withdrawals, or market data
- confirm alerting is green for:
  - API error rate
  - websocket disconnect rate
  - order placement latency
  - live market data freshness
  - withdrawal approval latency
- confirm data durability posture:
  - Cloud SQL backup status
  - Secret Manager secret versions are current
  - ledger backup status
  - wallet reconciliation status
  - incident bridge and on-call contacts ready

## Canary deploy procedure

1. Dispatch `Deploy GCP GKE` with the target environment and a `5` to `10` percent canary.
2. Wait for the workflow to:
   - build and push immutable images
   - apply the `infra/terraform/gcp-gke` root
   - get cluster credentials
   - deploy stable and canary workloads
   - smoke-test the direct canary services before any live traffic shift
   - update `HTTPRoute` weights to the requested canary percentage
3. Verify live routing:
   - `kubectl get httproute public-route admin-route -n trading-platform -o yaml`
   - `kubectl get deploy -n trading-platform`
4. Verify application health:
   - public home page loads
   - admin page loads
   - `/health` and `/ready` are green
   - `BTC/USD` and `ETH/USD` live prices update
   - order entry, cancel, login, and withdrawal approval flows succeed
5. Observe the canary for an agreed soak window before promotion.

## Promote procedure

1. Verify the canary soak window passed without regression.
2. Dispatch `Promote GCP GKE Canary`.
3. Confirm:
   - stable Deployments now use the canary image
   - canary Deployments are scaled back to `0`
   - `HTTPRoute` weights are back to `100/0`
4. Capture the release evidence:
   - workflow URL
   - commit SHA
   - image digests
   - deployment timestamps

## Rollback procedure

Trigger rollback immediately if any of the following happen:

- elevated API error rate
- market data freshness failure
- websocket instability
- order placement or cancellation regression
- broken admin approval flows
- latency, CPU, or memory saturation outside the rollback threshold

Rollback steps:

1. Dispatch `Roll Back GCP GKE Canary`.
2. Confirm:
   - stable services are back at `100%` traffic
   - canary services are back at `0%`
   - stable Deployments remain on the prior image
3. Validate the platform again with the same smoke checks used before promotion.
4. Record incident notes, timeline, and the reason for rollback.

## Post-deploy audit evidence

Collect and store the following for every production release:

- GitHub workflow link and actor
- exact Git SHA and image digests
- Terraform revision and any applied infrastructure changes
- canary percentage and soak duration
- screenshots or exports of dashboards during canary and post-promotion
- list of validated flows:
  - login
  - market data
  - order entry
  - cancellation
  - withdrawal request
  - withdrawal approval
- rollback decision, even when rollback was not needed

## Known follow-up items

- move public trader web to an edge CDN tier once the app is separated from cluster-only ingress
- replace the file-backed API store with Postgres before real-money operation
- add SLO-driven automated promotion and rollback gates
- add Binary Authorization, image signing, and stricter admission controls
