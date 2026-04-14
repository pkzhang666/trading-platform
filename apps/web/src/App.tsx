import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  type FeedConnectionStatus,
  formatAssetAmount,
  type AuthResponse,
  type DashboardState,
  type LiveMarketSnapshot,
  type MarketSymbol,
  type SystemHealth
} from "@trading-platform/common";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  (window.location.hostname === "localhost" && ["5173", "5174", "3000", "3001"].includes(window.location.port)
    ? "http://localhost:4000/api"
    : `${window.location.origin}/api`);
const wsBaseUrl = apiBaseUrl.replace("/api", "").replace(/^http/, "ws");

async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {})
    }
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload as T;
}

export function App(): React.JSX.Element {
  const [token, setToken] = useState<string>(() => localStorage.getItem("tp-token") ?? "");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("trader@trade.local");
  const [password, setPassword] = useState("Trader123!");
  const [name, setName] = useState("New Trader");
  const [markets, setMarkets] = useState<LiveMarketSnapshot[]>([]);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<MarketSymbol>("BTC/USD");
  const [liveMarket, setLiveMarket] = useState<LiveMarketSnapshot | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [price, setPrice] = useState("64000");
  const [quantity, setQuantity] = useState("0.1");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [depositAsset, setDepositAsset] = useState("USD");
  const [depositAmount, setDepositAmount] = useState("1000");
  const [withdrawAsset, setWithdrawAsset] = useState("USD");
  const [withdrawAmount, setWithdrawAmount] = useState("100");
  const [withdrawAddress, setWithdrawAddress] = useState("demo-wallet-address");
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([request<LiveMarketSnapshot[]>("/live/markets"), request<SystemHealth>("/system/health")])
      .then(([nextMarkets, health]) => {
        setMarkets(nextMarkets);
        setSystemHealth(health);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!token) {
      setDashboard(null);
      localStorage.removeItem("tp-token");
      return;
    }

    localStorage.setItem("tp-token", token);
    request<DashboardState>("/dashboard", undefined, token).then(setDashboard).catch((err: Error) => setError(err.message));
  }, [token]);

  useEffect(() => {
    const socket = new WebSocket(`${wsBaseUrl}/ws?channel=live-market&symbol=${encodeURIComponent(selectedMarket)}`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { payload: LiveMarketSnapshot };
      setLiveMarket(message.payload);
      setPrice(String(message.payload.lastPrice || ""));
    };

    return () => socket.close();
  }, [selectedMarket]);

  useEffect(() => {
    const target = markets.find((market) => market.symbol === selectedMarket);
    if (target?.lastPrice) {
      setPrice(String(target.lastPrice));
    }
  }, [markets, selectedMarket]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket = new WebSocket(`${wsBaseUrl}/ws?channel=private&token=${encodeURIComponent(token)}`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { payload: DashboardState };
      setDashboard(message.payload);
    };

    return () => socket.close();
  }, [token]);

  const selectedMarketMeta = useMemo(
    () => markets.find((market) => market.symbol === selectedMarket),
    [markets, selectedMarket]
  );

  function statusTone(status: FeedConnectionStatus): string {
    if (status === "connected") {
      return "status-chip approved";
    }

    if (status === "connecting") {
      return "status-chip pending";
    }

    return "status-chip rejected";
  }

  async function handleAuth(): Promise<void> {
    setError("");
    const path = authMode === "login" ? "/auth/login" : "/auth/register";
    const body = authMode === "login" ? { email, password } : { email, password, name };
    const response = await request<AuthResponse>(path, { method: "POST", body: JSON.stringify(body) });
    setToken(response.token);
  }

  async function handlePlaceOrder(): Promise<void> {
    if (!token) {
      return;
    }

    setError("");
    await request(
      "/orders",
      {
        method: "POST",
        body: JSON.stringify({
          symbol: selectedMarket,
          side,
          price: Number(price),
          quantity: Number(quantity)
        })
      },
      token
    );
  }

  async function handleDeposit(): Promise<void> {
    if (!token) {
      return;
    }

    await request(
      "/wallet/deposits",
      {
        method: "POST",
        body: JSON.stringify({
          asset: depositAsset,
          amount: Number(depositAmount)
        })
      },
      token
    );
  }

  async function handleWithdraw(): Promise<void> {
    if (!token) {
      return;
    }

    await request(
      "/wallet/withdrawals",
      {
        method: "POST",
        body: JSON.stringify({
          asset: withdrawAsset,
          amount: Number(withdrawAmount),
          address: withdrawAddress
        })
      },
      token
    );
  }

  async function handleCancelOrder(orderId: string): Promise<void> {
    if (!token) {
      return;
    }

    await request(`/orders/${orderId}`, { method: "DELETE" }, token);
  }

  return (
    <div className="app-shell">
      <section className="hero">
        <div>
          <span className="eyebrow">Centralized Exchange MVP</span>
          <h1>Build and operate your own OKX-style trading surface.</h1>
          <p>
            Live order books, an internal ledger, deposits, withdrawals, and admin workflows in one
            runnable stack.
          </p>
        </div>
        <div className="hero-card">
          <div className="hero-stat">
            <span>Markets</span>
            <strong>{markets.length}</strong>
          </div>
          <div className="hero-stat">
            <span>Selected</span>
            <strong>{selectedMarket}</strong>
          </div>
          <div className="hero-stat">
            <span>Last Price</span>
            <strong>{formatAssetAmount(liveMarket?.lastPrice ?? selectedMarketMeta?.lastPrice ?? 0, 2)}</strong>
          </div>
        </div>
      </section>

      {!token ? (
        <section className="panel auth-panel">
          <div className="panel-header">
            <h2>{authMode === "login" ? "Sign in" : "Create account"}</h2>
            <button className="ghost-button" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
              {authMode === "login" ? "Need an account?" : "Use existing account"}
            </button>
          </div>
          <div className="form-grid">
            {authMode === "register" && (
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          </div>
          {error && <p className="error-banner">{error}</p>}
          <button className="primary-button" onClick={() => void handleAuth()}>
            {authMode === "login" ? "Enter exchange" : "Create trader account"}
          </button>
          <p className="hint">Demo login: `trader@trade.local` / `Trader123!`</p>
        </section>
      ) : (
        <>
          <section className="grid-two">
            <div className="panel">
              <div className="panel-header">
                <h2>Markets</h2>
                <button className="ghost-button" onClick={() => setToken("")}>
                  Sign out
                </button>
              </div>
              <div className="market-list">
                {markets.map((market) => (
                  <button
                    key={market.symbol}
                    className={market.symbol === selectedMarket ? "market-button active" : "market-button"}
                    onClick={() => setSelectedMarket(market.symbol)}
                  >
                    <span>{market.symbol}</span>
                    <strong>{formatAssetAmount(market.lastPrice, 2)}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Balances</h2>
                <span>{dashboard?.me.email}</span>
              </div>
              <div className="balance-grid">
                {dashboard?.balances.map((balance) => (
                  <article key={balance.asset} className="balance-card">
                    <span>{balance.asset}</span>
                    <strong>{formatAssetAmount(balance.available, 6)}</strong>
                    <small>Frozen: {formatAssetAmount(balance.frozen, 6)}</small>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="grid-three">
            <div className="panel">
              <div className="panel-header">
                <h2>Order Entry</h2>
                <span>{selectedMarket}</span>
              </div>
              <div className="segmented">
                <button className={side === "buy" ? "active buy" : ""} onClick={() => setSide("buy")}>
                  Buy
                </button>
                <button className={side === "sell" ? "active sell" : ""} onClick={() => setSide("sell")}>
                  Sell
                </button>
              </div>
              <label>
                Limit price
                <input value={price} onChange={(event) => setPrice(event.target.value)} />
              </label>
              <label>
                Quantity
                <input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </label>
              <button className={side === "buy" ? "primary-button buy" : "primary-button sell"} onClick={() => void handlePlaceOrder()}>
                Submit {side} order
              </button>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Order Book</h2>
                <span>{liveMarket?.source ?? "coinbase"}</span>
              </div>
              <div className="list-row">
                <div>
                  <strong>{selectedMarket}</strong>
                  <small>{liveMarket?.connectionMessage ?? "Waiting for live feed..."}</small>
                </div>
                <span className={statusTone(liveMarket?.status ?? "disconnected")}>{liveMarket?.status ?? "disconnected"}</span>
              </div>
              <div className="book-columns">
                <div>
                  <h3>Bids</h3>
                  {liveMarket?.orderBook.bids.map((level) => (
                    <div key={`bid-${level.price}`} className="book-row positive">
                      <span>{formatAssetAmount(level.price, 2)}</span>
                      <span>{formatAssetAmount(level.quantity, 6)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h3>Asks</h3>
                  {liveMarket?.orderBook.asks.map((level) => (
                    <div key={`ask-${level.price}`} className="book-row negative">
                      <span>{formatAssetAmount(level.price, 2)}</span>
                      <span>{formatAssetAmount(level.quantity, 6)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Recent Trades</h2>
                <span>{liveMarket?.trades.length ?? 0} live prints</span>
              </div>
              <div className="trades-list">
                {liveMarket?.trades.map((trade) => (
                  <div key={trade.id} className="trade-row">
                    <span>{formatAssetAmount(trade.price, 2)}</span>
                    <span>{formatAssetAmount(trade.quantity, 6)}</span>
                    <small>{new Date(trade.createdAt).toLocaleTimeString()}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid-three">
            <div className="panel">
              <div className="panel-header">
                <h2>Deposit</h2>
                <span>Instant demo credit</span>
              </div>
              <label>
                Asset
                <select value={depositAsset} onChange={(event) => setDepositAsset(event.target.value)}>
                  <option>BTC</option>
                  <option>ETH</option>
                  <option>USD</option>
                </select>
              </label>
              <label>
                Amount
                <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
              </label>
              <button className="primary-button" onClick={() => void handleDeposit()}>
                Post deposit
              </button>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Withdraw</h2>
                <span>Admin approval required</span>
              </div>
              <label>
                Asset
                <select value={withdrawAsset} onChange={(event) => setWithdrawAsset(event.target.value)}>
                  <option>BTC</option>
                  <option>ETH</option>
                  <option>USD</option>
                </select>
              </label>
              <label>
                Amount
                <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} />
              </label>
              <label>
                Address
                <input value={withdrawAddress} onChange={(event) => setWithdrawAddress(event.target.value)} />
              </label>
              <button className="primary-button" onClick={() => void handleWithdraw()}>
                Request withdrawal
              </button>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Withdrawals</h2>
                <span>User queue</span>
              </div>
              <div className="list-stack">
                {dashboard?.withdrawals.map((withdrawal) => (
                  <div key={withdrawal.id} className="list-row">
                    <div>
                      <strong>{withdrawal.asset}</strong> {formatAssetAmount(withdrawal.amount, 6)}
                    </div>
                    <span className={`status-chip ${withdrawal.status}`}>{withdrawal.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Open Orders</h2>
              <span>{dashboard?.openOrders.length ?? 0} working</span>
            </div>
            <div className="list-stack">
              {dashboard?.openOrders.map((order) => (
                <div key={order.id} className="list-row">
                  <div>
                    <strong>{order.side.toUpperCase()}</strong> {order.symbol} @ {formatAssetAmount(order.price, 2)}
                    <small>
                      Remaining {formatAssetAmount(order.remainingQuantity, 6)} / {formatAssetAmount(order.quantity, 6)}
                    </small>
                  </div>
                  <button className="ghost-button" onClick={() => void handleCancelOrder(order.id)}>
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Platform Health</h2>
              <span>{systemHealth?.ok ? "Nominal" : "Attention needed"}</span>
            </div>
            <div className="list-stack">
              {systemHealth?.services.map((service) => (
                <div key={service.name} className="list-row">
                  <div>
                    <strong>{service.name}</strong>
                    <small>{service.details ?? "No details"}</small>
                  </div>
                  <span className={service.ok ? "status-chip approved" : "status-chip rejected"}>
                    {service.ok ? "ok" : "degraded"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
