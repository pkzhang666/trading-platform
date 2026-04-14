export type Asset = "BTC" | "ETH" | "USD";
export type MarketSymbol = "BTC/USD" | "ETH/USD";
export type OrderSide = "buy" | "sell";
export type OrderType = "limit";
export type OrderStatus = "open" | "partially_filled" | "filled" | "cancelled";
export type UserRole = "trader" | "admin";
export type WithdrawalStatus = "pending" | "approved" | "rejected";
export type FeedConnectionStatus = "connecting" | "connected" | "degraded" | "disconnected";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface UserSession {
  token: string;
  userId: string;
  createdAt: string;
}

export interface Balance {
  asset: Asset;
  available: number;
  frozen: number;
}

export interface Market {
  symbol: MarketSymbol;
  baseAsset: Asset;
  quoteAsset: Asset;
  lastPrice: number;
  pricePrecision: number;
  quantityPrecision: number;
}

export interface Order {
  id: string;
  userId: string;
  symbol: MarketSymbol;
  side: OrderSide;
  type: OrderType;
  price: number;
  quantity: number;
  remainingQuantity: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  symbol: MarketSymbol;
  price: number;
  quantity: number;
  buyOrderId: string;
  sellOrderId: string;
  makerSide: OrderSide;
  takerOrderId: string;
  buyerUserId: string;
  sellerUserId: string;
  createdAt: string;
}

export interface Deposit {
  id: string;
  userId: string;
  asset: Asset;
  amount: number;
  createdAt: string;
}

export interface Withdrawal {
  id: string;
  userId: string;
  asset: Asset;
  amount: number;
  address: string;
  status: WithdrawalStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewerId?: string;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookSnapshot {
  symbol: MarketSymbol;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastPrice: number;
}

export interface LiveTrade {
  id: string;
  symbol: MarketSymbol;
  price: number;
  quantity: number;
  side: "buy" | "sell" | "unknown";
  source: "coinbase";
  createdAt: string;
}

export interface LiveMarketSnapshot {
  symbol: MarketSymbol;
  source: "coinbase";
  status: FeedConnectionStatus;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  volume24h: number;
  updatedAt: string;
  orderBook: OrderBookSnapshot;
  trades: LiveTrade[];
  connectionMessage?: string;
}

export interface SystemHealth {
  ok: boolean;
  services: Array<{
    name: string;
    ok: boolean;
    details?: string;
    updatedAt: string;
  }>;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface DashboardState {
  me: User;
  balances: Balance[];
  openOrders: Order[];
  withdrawals: Withdrawal[];
}

export interface AdminOverview {
  users: number;
  openOrders: number;
  trades: number;
  pendingWithdrawals: number;
  dailyVolumeUsd: number;
}

export interface ApiError {
  error: string;
}

export const assets: Asset[] = ["BTC", "ETH", "USD"];

export const markets: Market[] = [
  {
    symbol: "BTC/USD",
    baseAsset: "BTC",
    quoteAsset: "USD",
    lastPrice: 64000,
    pricePrecision: 2,
    quantityPrecision: 5
  },
  {
    symbol: "ETH/USD",
    baseAsset: "ETH",
    quoteAsset: "USD",
    lastPrice: 3200,
    pricePrecision: 2,
    quantityPrecision: 4
  }
];

export function formatAssetAmount(value: number, maximumFractionDigits = 6): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

export function getMarket(symbol: MarketSymbol): Market {
  const market = markets.find((item) => item.symbol === symbol);

  if (!market) {
    throw new Error(`Unknown market: ${symbol}`);
  }

  return market;
}
