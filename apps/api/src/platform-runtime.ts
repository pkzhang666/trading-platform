import type {
  AdminOverview,
  Asset,
  DashboardState,
  Deposit,
  Market,
  MarketSymbol,
  Order,
  OrderBookSnapshot,
  OrderSide,
  Trade,
  User,
  Withdrawal
} from "@trading-platform/common";
import type { ActivityEvent } from "./domain.js";

export interface PlatformRuntime {
  subscribe(listener: (event: ActivityEvent) => void): () => void;
  register(email: string, password: string, name: string): Promise<User>;
  login(email: string, password: string): Promise<{ token: string; user: User }>;
  getUserByToken(token: string): Promise<User | undefined>;
  getDashboard(userId: string): Promise<DashboardState>;
  listMarkets(): Promise<Market[]>;
  updateReferencePrice(symbol: MarketSymbol, price: number): Promise<void>;
  getOrderBook(symbol: MarketSymbol): Promise<OrderBookSnapshot>;
  listRecentTrades(symbol: MarketSymbol): Promise<Trade[]>;
  placeOrder(
    userId: string,
    input: { symbol: MarketSymbol; side: OrderSide; price: number; quantity: number }
  ): Promise<Order>;
  cancelOrder(userId: string, orderId: string): Promise<Order>;
  createDeposit(userId: string, asset: Asset, amount: number): Promise<Deposit>;
  requestWithdrawal(userId: string, asset: Asset, amount: number, address: string): Promise<Withdrawal>;
  listOrdersForUser(userId: string): Promise<Order[]>;
  adminOverview(): Promise<AdminOverview>;
  adminUsers(): Promise<User[]>;
  adminWithdrawals(): Promise<Withdrawal[]>;
  reviewWithdrawal(adminUserId: string, withdrawalId: string, action: "approve" | "reject"): Promise<Withdrawal>;
}
