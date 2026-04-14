# Architecture

## MVP topology

### Runtime components

- `apps/api`: trading API, matching engine, balance ledger, wallet request handling
- `apps/api/src/live-market-data.ts`: Coinbase Exchange market data adapter for BTC/USD and ETH/USD
- `apps/api/src/postgres-platform.ts`: Cloud SQL-backed trading, wallet, and ledger runtime
- `apps/web`: trader interface
- `apps/admin`: operations console
- `packages/common`: shared domain types

### Interaction model

1. Trader authenticates through the API.
2. Trader submits a limit order.
3. API reserves balances and routes the order through the in-process matching engine.
4. If a cross exists, the engine creates trades and updates balances.
5. Coinbase market-data connections ingest live BTC/USD and ETH/USD prices plus L2 order book updates.
6. Public and private websocket channels push fresh snapshots to clients.
7. Withdrawals are frozen until an admin reviews them in the admin console.

## Production target

The intended production split is:

- edge gateway
- auth service
- account and profile service
- append-only ledger service
- order management service
- matching engine service
- market data service
- wallet orchestration service
- treasury service
- compliance and surveillance service

## Cloud strategy

### AWS

- VPC for network isolation
- ECR for images
- ECS Fargate for stateless app services
- ALB for ingress
- CloudWatch for logs and metrics
- reusable Terraform modules for networking and service deployment

### GCP

- Artifact Registry for images
- GKE for production microservice execution and Gateway API traffic management
- Cloud Run for lighter-weight sandbox environments
- workload identity and federated CI authentication
- Cloud SQL for PostgreSQL-backed wallet and ledger persistence
- Secret Manager for runtime secret delivery
- Cloud Logging and Cloud Monitoring
- reusable Terraform modules for project services, networking, cluster, registry, and runtime composition

### Multi-cloud

- one primary execution plane per market
- separate control-plane replication
- no active-active split-brain order book
- cloud-local secrets and wallet boundaries
