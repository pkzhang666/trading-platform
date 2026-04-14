# Trading Platform

A runnable MVP trading platform inspired by OKX, packaged as a Node monorepo with:

- a spot trading API with a matching engine and internal ledger
- a trader-facing web app
- an admin console for withdrawal approvals
- Docker packaging for all apps
- Terraform blueprints for AWS and GCP
- GitHub Actions CI/CD pipelines

## What is included

### Product surface

- user registration and login
- market list for `BTC/USDT` and `ETH/USDT`
- limit order placement and cancellation
- live order book and trade feed over WebSocket
- balances, deposits, and withdrawal requests
- admin queue for approving or rejecting withdrawals

### Platform surface

- monorepo with npm workspaces
- container builds for API, web, and admin
- Terraform for AWS and GCP deployment foundations
- CI pipeline for install, typecheck, and build
- CD pipelines for Terraform plan/apply and image builds

## Workspace layout

```text
trading platform/
├─ apps/
│  ├─ api/              # Express API + matching engine + websocket streams
│  ├─ web/              # Trader UI
│  └─ admin/            # Operations UI
├─ packages/
│  └─ common/           # Shared types and market metadata
├─ infra/
│  └─ terraform/
│     ├─ aws/           # AWS deployment blueprint
│     └─ gcp/           # GCP deployment blueprint
├─ docs/
│  └─ api.md            # Endpoint summary
├─ .github/workflows/   # CI/CD pipelines
├─ docker-compose.yml   # Local container stack
├─ architecture.md
├─ services.md
└─ plan.md
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

## Architecture notes

This repository is an MVP, not a licensed production exchange. The current API uses a file-backed state store so the whole platform can run immediately without external dependencies.

For production hardening, the next upgrades should be:

- Postgres-backed append-only ledger
- Redis or Kafka-backed market data fanout
- HSM-backed wallet signing boundaries
- dedicated risk, custody, and reconciliation services
- jurisdiction-specific compliance controls

See [architecture.md](./architecture.md) and [services.md](./services.md) for the target design.

## CI/CD overview

- `ci.yml` runs install, typecheck, and build on pushes and pull requests
- `ci.yml` also runs API tests plus Terraform formatting and validation
- `deploy-aws.yml` builds images and runs Terraform in `infra/terraform/aws`
- `deploy-gcp.yml` builds images and runs Terraform in `infra/terraform/gcp`

The deployment workflows expect repository secrets and cloud credentials to be configured first.

## Terraform overview

- AWS blueprint targets VPC, ECR, ECS Fargate, ALB, CloudWatch Logs, and IAM roles
- GCP blueprint targets Artifact Registry, Cloud Run services, service accounts, and IAM bindings

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
