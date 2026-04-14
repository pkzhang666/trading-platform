import type React from "react";
import { useEffect, useState } from "react";
import { formatAssetAmount, type AdminOverview, type AuthResponse, type User, type Withdrawal } from "@trading-platform/common";

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
  const [token, setToken] = useState<string>(() => localStorage.getItem("tp-admin-token") ?? "");
  const [email, setEmail] = useState("admin@trade.local");
  const [password, setPassword] = useState("Admin123!");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setOverview(null);
      setUsers([]);
      setWithdrawals([]);
      localStorage.removeItem("tp-admin-token");
      return;
    }

    localStorage.setItem("tp-admin-token", token);
    void Promise.all([
      request<AdminOverview>("/admin/overview", undefined, token),
      request<User[]>("/admin/users", undefined, token),
      request<Withdrawal[]>("/admin/withdrawals", undefined, token)
    ])
      .then(([nextOverview, nextUsers, nextWithdrawals]) => {
        setOverview(nextOverview);
        setUsers(nextUsers);
        setWithdrawals(nextWithdrawals);
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket = new WebSocket(`${wsBaseUrl}/ws?channel=admin&token=${encodeURIComponent(token)}`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { payload: { overview: AdminOverview; withdrawals: Withdrawal[] } };
      setOverview(message.payload.overview);
      setWithdrawals(message.payload.withdrawals);
    };

    return () => socket.close();
  }, [token]);

  async function handleLogin(): Promise<void> {
    setError("");
    const response = await request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setToken(response.token);
  }

  async function handleReview(withdrawalId: string, action: "approve" | "reject"): Promise<void> {
    if (!token) {
      return;
    }

    await request(`/admin/withdrawals/${withdrawalId}/${action}`, { method: "POST" }, token);
  }

  return (
    <div className="admin-shell">
      <header className="masthead">
        <div>
          <span className="eyebrow">Operations Console</span>
          <h1>Risk, treasury, and withdrawal approvals.</h1>
        </div>
        {token && (
          <button className="ghost-button" onClick={() => setToken("")}>
            Sign out
          </button>
        )}
      </header>

      {!token ? (
        <section className="panel auth-card">
          <h2>Admin login</h2>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="error-banner">{error}</p>}
          <button className="primary-button" onClick={() => void handleLogin()}>
            Enter console
          </button>
          <p className="hint">Demo login: `admin@trade.local` / `Admin123!`</p>
        </section>
      ) : (
        <>
          <section className="stats-grid">
            <article className="panel stat-card">
              <span>Users</span>
              <strong>{overview?.users ?? 0}</strong>
            </article>
            <article className="panel stat-card">
              <span>Open Orders</span>
              <strong>{overview?.openOrders ?? 0}</strong>
            </article>
            <article className="panel stat-card">
              <span>Trades</span>
              <strong>{overview?.trades ?? 0}</strong>
            </article>
            <article className="panel stat-card">
              <span>24h Volume</span>
              <strong>${formatAssetAmount(overview?.dailyVolumeUsd ?? 0, 2)}</strong>
            </article>
          </section>

          <section className="console-grid">
            <div className="panel">
              <div className="panel-header">
                <h2>Withdrawal Queue</h2>
                <span>{overview?.pendingWithdrawals ?? 0} pending</span>
              </div>
              <div className="list-stack">
                {withdrawals.map((withdrawal) => (
                  <div key={withdrawal.id} className="list-row">
                    <div>
                      <strong>{withdrawal.asset}</strong> {formatAssetAmount(withdrawal.amount, 6)}
                      <small>{withdrawal.address}</small>
                    </div>
                    <div className="actions">
                      <span className={`status-chip ${withdrawal.status}`}>{withdrawal.status}</span>
                      {withdrawal.status === "pending" && (
                        <>
                          <button className="approve" onClick={() => void handleReview(withdrawal.id, "approve")}>
                            Approve
                          </button>
                          <button className="reject" onClick={() => void handleReview(withdrawal.id, "reject")}>
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Users</h2>
                <span>{users.length} registered</span>
              </div>
              <div className="list-stack">
                {users.map((user) => (
                  <div key={user.id} className="list-row">
                    <div>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </div>
                    <span className="role-chip">{user.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
