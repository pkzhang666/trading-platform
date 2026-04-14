# API Notes

## Public endpoints

- `GET /health`
- `GET /ready`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/markets`
- `GET /api/live/markets`
- `GET /api/live/markets/:symbol`
- `GET /api/orderbook/:symbol`
- `GET /api/trades/:symbol`
- `GET /api/live/orderbook/:symbol`
- `GET /api/live/trades/:symbol`
- `GET /api/system/health`

## Authenticated trader endpoints

Use `Authorization: Bearer <token>`.

- `GET /api/me`
- `GET /api/dashboard`
- `GET /api/orders`
- `POST /api/orders`
- `DELETE /api/orders/:id`
- `POST /api/wallet/deposits`
- `POST /api/wallet/withdrawals`

## Admin endpoints

Admin token required.

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `GET /api/admin/withdrawals`
- `POST /api/admin/withdrawals/:id/approve`
- `POST /api/admin/withdrawals/:id/reject`

## WebSocket channels

Endpoint: `/ws`

### Market stream

Query params:

- `channel=market`
- `symbol=BTC/USD` or `ETH/USD`

### Live market stream

Query params:

- `channel=live-market`
- `symbol=BTC/USD` or `ETH/USD`

### Private stream

Query params:

- `channel=private`
- `token=<jwt-like session token>`

### Admin stream

Query params:

- `channel=admin`
- `token=<admin session token>`
