# Services

## API service

Responsibilities:

- authenticate users
- maintain balances and sessions
- place, match, and cancel orders
- expose market and admin APIs
- broadcast websocket updates

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

- risk engine
- reconciliation engine
- blockchain indexers
- treasury and settlement workers
- compliance and AML adapters
