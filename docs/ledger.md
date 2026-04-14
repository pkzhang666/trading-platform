# Wallet And Ledger Model

## Design goals

- append-only journal for all balance-changing events
- no direct mutation of user balances without journal entries
- separate `available` and `locked` balances for trading and withdrawal controls
- deterministic audit trail for deposits, order reserves, trade settlement, and withdrawals
- current balance cache on accounts for fast reads while preserving entry history

## Account model

Each user gets two internal ledger accounts per asset:

- `available`
- `locked`

The platform also keeps a system `external` account per asset. This represents assets entering or leaving the platform boundary and lets every journal stay balanced.

## Journal model

Every balance-changing operation creates a `ledger_journals` row plus the related `ledger_entries`.

Examples:

- deposit: `external -> user available`
- order reserve: `user available -> user locked`
- cancel or refund: `user locked -> user available`
- trade settlement:
  - buyer locked quote -> seller available quote
  - seller locked base -> buyer available base
  - locked quote refund back to buyer available when execution improves on the reserved price
- withdrawal request: `user available -> user locked`
- withdrawal approve: `user locked -> external`
- withdrawal reject: `user locked -> user available`

## Why this is closer to industry practice

- it separates user spendable balances from reserved balances
- it gives an immutable journal for reconciliation and post-incident review
- it keeps matching, wallet freezing, and withdrawal review flows consistent
- it avoids the common anti-pattern of silently overwriting a balance column with no ledger trail

## Current boundaries

This repository now uses the journal model in the Postgres-backed runtime, but it is still not a full custody stack.

What is still missing for real-money production:

- dedicated wallet orchestration service separated from the API process
- blockchain confirmation tracking and reconciliation workers
- hot, warm, and cold wallet segregation
- approval policies with quorum controls for high-risk withdrawals
- fee, treasury, and omnibus wallet accounting
- external statement reconciliation against chain data and banking rails
