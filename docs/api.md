# API Notes

## Public endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/markets`
- `GET /api/orderbook/:symbol`
- `GET /api/trades/:symbol`

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
- `symbol=BTC/USDT` or `ETH/USDT`

### Private stream

Query params:

- `channel=private`
- `token=<jwt-like session token>`

### Admin stream

Query params:

- `channel=admin`
- `token=<admin session token>`
