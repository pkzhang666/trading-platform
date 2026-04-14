# Trading Platform

A production-oriented trading platform foundation inspired by OKX, packaged as a Node monorepo with:

- a spot trading API with a matching engine and internal ledger
- live BTC/USD and ETH/USD reference market data from Coinbase Exchange
- a trader-facing web app
- an admin console for withdrawal approvals
- Docker packaging for all apps
- Terraform blueprints for AWS, GCP Cloud Run, and GCP GKE
- Cloud SQL and Secret Manager integration for the GCP production lane
- GitHub Actions CI/CD pipelines

## What is included

### Product surface

- user registration and login
- market list for `BTC/USD` and `ETH/USD`
- limit order placement and cancellation
- live order book and trade feed over WebSocket
- balances, deposits, and withdrawal requests
- admin queue for approving or rejecting withdrawals

### Platform surface

- monorepo with npm workspaces
- container builds for API, web, and admin
- Terraform for AWS and GCP deployment foundations
- Kubernetes manifest templates for GKE canary rollout
- CI pipeline for install, typecheck, and build
- CD pipelines for infrastructure apply and image builds

## Workspace layout

```text
trading platform/
├── apps/
│   ├── api/              # Express API + matching engine + websocket streams
│   ├── web/              # Trader UI
│   └── admin/            # Operations UI
├── packages/
│   └── common/           # Shared types and market metadata
├── infra/
│   ├── terraform/
│   │   ├── aws/          # AWS environment root
│   │   ├── gcp/          # Cloud Run oriented GCP root
│   │   ├── gcp-gke/      # Production GKE root
│   │   └── modules/      # Reusable Terraform modules
│   └── k8s/
│       └── gke/          # GKE stable/canary manifest template
├── docs/
│   ├── api.md
│   └── gke-runbook.md
├── .github/workflows/    # CI/CD pipelines
├── docker-compose.yml
├── architecture.md
├── services.md
└── plan.md
```

## Local run

### Prerequisites

- Node.js 22+
- npm 11+

### Start in development mode

```bash
npm install
npm run dev
```

Services:

- Trader web: `http://localhost:5173`
- Admin web: `http://localhost:5174`
- API: `http://localhost:4000`

### Start with Docker

```bash
docker compose up --build
```

If Docker reports that it cannot connect to `docker_engine`, start Docker Desktop first and rerun the command.

Services:

- Trader web: `http://localhost:3000`
- Admin web: `http://localhost:3001`
- API: `http://localhost:4000`

### Demo users

- Trader: `trader@trade.local` / `Trader123!`
- Admin: `admin@trade.local` / `Admin123!`

## Live market data

The platform ingests live BTC/USD and ETH/USD data from Coinbase Exchange and exposes it through:

- REST endpoints under `/api/live/*`
- WebSocket channel `live-market`
- system health endpoints `/health`, `/ready`, and `/api/system/health`

This gives the public market view real exchange prices and order book movement while the internal order-entry flow remains the platform's own matching environment.

On Windows in this environment, the initial live-market warm-up can take roughly 20 to 30 seconds while the first Coinbase snapshots are fetched.

## Architecture notes

This repository is still not a licensed production exchange. The current API uses a file-backed state store so the whole platform can run immediately without external dependencies.

For production hardening, the next upgrades should be:

- Redis or Kafka-backed market data fanout
- HSM-backed wallet signing boundaries
- dedicated risk, custody, and reconciliation services
- jurisdiction-specific compliance controls

See [architecture.md](./architecture.md) and [services.md](./services.md) for the target design.

## CI/CD overview

- `ci.yml` runs install, typecheck, build, API tests, and Terraform validation
- `deploy-aws.yml` builds images and runs Terraform in `infra/terraform/aws`
- `deploy-gcp.yml` is the production GKE pipeline: it provisions `infra/terraform/gcp-gke`, deploys stable and canary workloads, smoke-tests direct canary services, and then shifts weighted Gateway API traffic
- `promote-gcp.yml` promotes the GKE canary images into the stable Deployments and resets traffic to `100/0`
- `rollback-gcp.yml` restores `100/0` traffic to the stable workloads and scales canary Deployments down
- `deploy-gcp-cloud-run.yml` and `promote-gcp-cloud-run.yml` keep the lighter Cloud Run lane available for sandbox environments
- all GCP workflows use direct Workload Identity Federation from GitHub Actions and do not impersonate a deploy service account

The deployment workflows expect repository secrets, GitHub environment protection rules, and cloud credentials to be configured first.

For GCP, grant the GitHub workload identity principal the project-level roles it needs directly, for example on Artifact Registry, GKE, Gateway-related services, and Terraform-managed resources. Because the workflows do not impersonate a service account, `GCP_DEPLOY_SERVICE_ACCOUNT` is not used.

## Progressive delivery notes

- GKE is the primary production path for microservices in this repository
- the GKE lane uses separate stable and canary Deployments plus weighted `HTTPRoute` backends so canary traffic can be audited and rolled back without mutating the stable image in place
- the canary workflow keeps live traffic at `0%` until the direct canary services pass smoke checks
- promotion moves the stable Deployments to the canary image and scales canary Deployments back down
- rollback restores `100/0` routing to stable while leaving the previous stable image untouched
- the production API pod uses Workload Identity, Secret Manager client lookups, and a Cloud SQL Auth Proxy sidecar rather than static Kubernetes secrets
- Cloud Run remains available for lightweight environments, and its Terraform root intentionally ignores image and traffic drift so the delivery workflow can manage immutable revisions safely
- AWS is not doing true canary yet because the current ECS module is a single-target-group rollout. Proper AWS canary or blue-green for this stack should be implemented with ECS CodeDeploy and weighted target groups rather than a direct in-place service update

See [docs/gke-runbook.md](./docs/gke-runbook.md) for the production audit and rollout checklist.
See [docs/ledger.md](./docs/ledger.md) for the wallet and ledger model.

## Terraform overview

- AWS environment root composes reusable modules for networking and ECS services
- GCP Cloud Run root composes reusable modules for service accounts, Artifact Registry, and Cloud Run services
- GCP GKE root composes reusable modules for project services, networking, Artifact Registry, Cloud SQL for PostgreSQL, Secret Manager secrets, and the GKE cluster
- the module layout follows the same reusable-composition style used elsewhere in this workspace
- AWS blueprint targets VPC, ECS Fargate, ALB, CloudWatch Logs, and IAM roles
- GCP GKE blueprint targets Artifact Registry, VPC networking, private-node GKE, and Gateway API managed ingress

The Terraform directories are designed to be environment-driven via variables and CI inputs.

## Useful commands

```bash
npm run test
npm run infra:validate
npm run docker:build
```

## Next steps

1. Move persistence from file storage to Postgres.
2. Split matching, ledger, and wallet functions into separate services.
3. Add KYC provider integration and AML screening.
4. Add real custody connectors and treasury workflows.
