# Services

## API service

Responsibilities:

- authenticate users
- maintain sessions
- place, match, and cancel orders
- ingest live BTC/USD and ETH/USD data from Coinbase Exchange
- expose market and admin APIs
- broadcast websocket updates
- load runtime secrets from Google Secret Manager in the GCP production lane
- use the Postgres-backed wallet and ledger runtime in the GCP production lane

## Wallet and ledger runtime

Responsibilities:

- keep append-only journal entries for all balance-changing operations
- separate `available` and `locked` balances per user and asset
- persist account state in PostgreSQL
- support withdrawal freeze, approval, and release flows
- support order reserve, settlement, and refund flows

## Trader web

Responsibilities:

- trader login and session management
- market selection
- order entry
- order book and trade display
- deposit and withdrawal flows

## Admin web

Responsibilities:

- admin login
- withdrawal review queue
- user visibility
- top-level operational metrics

## Shared package

Responsibilities:

- shared domain types
- market metadata
- formatting helpers

## Planned future services

- dedicated wallet orchestration service
- append-only ledger service with independent reconciliation
- risk engine
- reconciliation engine
- blockchain indexers
- treasury and settlement workers
- compliance and AML adapters
