# Architecture

## MVP topology

### Runtime components

- `apps/api`: trading API, matching engine, balance ledger, wallet request handling
- `apps/web`: trader interface
- `apps/admin`: operations console
- `packages/common`: shared domain types

### Interaction model

1. Trader authenticates through the API.
2. Trader submits a limit order.
3. API reserves balances and routes the order through the in-process matching engine.
4. If a cross exists, the engine creates trades and updates balances.
5. Market and private websocket channels push fresh snapshots to clients.
6. Withdrawals are frozen until an admin reviews them in the admin console.

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

### GCP

- Artifact Registry for images
- Cloud Run for stateless app services
- IAM service accounts per service
- Cloud Logging and Cloud Monitoring

### Multi-cloud

- one primary execution plane per market
- separate control-plane replication
- no active-active split-brain order book
- cloud-local secrets and wallet boundaries
