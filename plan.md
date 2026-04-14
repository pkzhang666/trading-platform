# Trading Platform Plan

## Objective

Build a centralized exchange platform comparable in shape to OKX, starting with spot trading and a cloud-portable architecture that can run on AWS, GCP, or across both.

## Product Phases

### Phase 0 - Foundations

- Product scope and jurisdiction decision
- Regulatory gap analysis
- Threat model and trust boundaries
- Reference architecture
- Environment strategy: dev, staging, prod

### Phase 1 - MVP Spot Exchange

- User registration, auth, MFA, device trust
- KYC / KYB integration points
- Accounts and double-entry ledger
- Deposit / withdrawal service
- Spot order entry APIs
- Matching engine for a small set of pairs
- WebSocket market data and private user streams
- Admin console for support and operations

### Phase 2 - Exchange Reliability

- Risk checks before order acceptance
- Circuit breakers and kill switches
- Treasury and hot / warm / cold wallet workflows
- Real-time reconciliation
- Audit trails and surveillance events
- SRE dashboards, on-call alerts, runbooks

### Phase 3 - Advanced Products

- Margin engine
- Perpetual futures
- Options
- Copy trading
- Institutional APIs

## Service Architecture

### User-facing

- Web app
- Mobile app
- Public REST API
- Public / private WebSocket gateways

### Trading core

- API gateway
- Session and auth service
- Account service
- Ledger service
- Order management service
- Matching engine
- Risk engine
- Market data fanout service
- Clearing and settlement service

### Asset platform

- Wallet orchestration service
- Blockchain listener services
- Fiat rails integration service
- Treasury service
- Key management boundary

### Governance and analytics

- Compliance service
- Fraud and surveillance service
- Reporting service
- Data lake / warehouse
- Feature store for risk models

## Data Design Principles

- Ledger is append-only and authoritative
- Matching engine owns order book state
- Event-driven integration between bounded contexts
- Transactional systems and analytics systems are separated
- Every balance change is traceable to a business event

## Infrastructure Strategy

### Shared baseline

- Kubernetes for most services
- Low-latency matching can run on dedicated nodes or bare-metal style instances
- Terraform for infra provisioning
- GitOps for deployments
- Centralized secrets and HSM-backed key custody
- Multi-region observability and incident response

### AWS option

- Route 53 + Global Accelerator
- EKS
- MSK
- Aurora PostgreSQL
- DynamoDB where key-value scale matters
- ElastiCache Redis
- S3 data lake
- CloudWatch + OpenSearch + Grafana

### GCP option

- Cloud DNS + global load balancing
- GKE
- Pub/Sub plus Kafka when strict stream semantics require it
- AlloyDB or Cloud SQL PostgreSQL
- Bigtable where key-value scale matters
- Memorystore Redis
- GCS + BigQuery
- Cloud Monitoring + Managed Prometheus + Grafana

### Multi-cloud option

- Single active trading region per market to avoid split-brain in matching
- Control-plane services can be replicated cross-cloud
- Kafka replication between clouds for downstream consumers
- Independent wallet and key domains per cloud/provider
- Fail over by product or region, not by active-active shared order book

## Non-Functional Targets

- P99 order acknowledgment under 20 ms within primary region
- Deterministic matching behavior and replayability
- Zero data loss for ledger events
- Full auditability for balances, positions, and withdrawals
- Recovery point objective near zero for core financial records
- Recovery time objective measured in minutes for non-matching services

## Security Priorities

- Hardware-backed key custody for signing boundaries
- Strict separation between trading, wallet, and admin planes
- Mandatory MFA and privileged access controls
- Continuous reconciliation for balances and wallet movements
- Tamper-evident audit logs
- DDoS, bot, and abuse controls at the edge

## Delivery Plan

### Workstream 1 - Product and compliance

- Define supported jurisdictions
- Identify licenses and reporting obligations
- Finalize onboarding and limits model

### Workstream 2 - Core trading

- Build ledger
- Build order management
- Build matching engine
- Build market data broadcast

### Workstream 3 - Assets and custody

- Wallet architecture
- Signing controls
- Deposit / withdrawal flows
- Reconciliation

### Workstream 4 - Platform engineering

- Cloud landing zone
- CI/CD and GitOps
- Service templates
- Observability stack

## Recommended First Milestone

Ship a narrow but real exchange slice:

- email + MFA login
- KYC integration stub
- BTC/USDT and ETH/USDT spot markets
- internal ledger
- matching engine
- wallet deposit detection
- withdrawals with manual approval
- admin operations dashboard

## Next Build Artifacts

The natural next docs to add in this folder are:

- `architecture.md`
- `services.md`
- `infra/terraform/`
- `apps/web/`
- `apps/api/`
- `apps/admin/`
