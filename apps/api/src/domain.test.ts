import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { TradingPlatform } from "./domain.js";

function createPlatform(name: string): { platform: TradingPlatform; filePath: string } {
  const filePath = path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random()}.json`);
  return {
    platform: new TradingPlatform(filePath),
    filePath
  };
}

test("matches crossing orders and records a trade", () => {
  const { platform, filePath } = createPlatform("matching");

  try {
    const login = platform.login("trader@trade.local", "Trader123!");
    const admin = platform.login("admin@trade.local", "Admin123!");

    const order = platform.placeOrder(login.user.id, {
      symbol: "BTC/USDT",
      side: "buy",
      price: 65000,
      quantity: 0.1
    });

    assert.equal(order.status, "filled");
    const trades = platform.listRecentTrades("BTC/USDT");
    assert.ok(trades.length > 0);

    const dashboard = platform.getDashboard(login.user.id);
    const btcBalance = dashboard.balances.find((item) => item.asset === "BTC");
    assert.ok(btcBalance);
    assert.ok(btcBalance.available > 2.5);

    const adminDashboard = platform.getDashboard(admin.user.id);
    assert.ok(adminDashboard.balances.length > 0);
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});

test("withdrawals freeze funds until admin review", () => {
  const { platform, filePath } = createPlatform("withdrawals");

  try {
    const trader = platform.login("trader@trade.local", "Trader123!");
    const admin = platform.login("admin@trade.local", "Admin123!");

    const withdrawal = platform.requestWithdrawal(trader.user.id, "USDT", 100, "wallet-addr-1");
    assert.equal(withdrawal.status, "pending");

    const pendingDashboard = platform.getDashboard(trader.user.id);
    const pendingUsdt = pendingDashboard.balances.find((item) => item.asset === "USDT");
    assert.ok(pendingUsdt);
    assert.equal(pendingUsdt.frozen, 100);

    const approved = platform.reviewWithdrawal(admin.user.id, withdrawal.id, "approve");
    assert.equal(approved.status, "approved");

    const finalDashboard = platform.getDashboard(trader.user.id);
    const finalUsdt = finalDashboard.balances.find((item) => item.asset === "USDT");
    assert.ok(finalUsdt);
    assert.equal(finalUsdt.frozen, 0);
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});
