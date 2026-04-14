export type Asset = "BTC" | "ETH" | "USDT";
export type MarketSymbol = "BTC/USDT" | "ETH/USDT";
export type OrderSide = "buy" | "sell";
export type OrderType = "limit";
export type OrderStatus = "open" | "partially_filled" | "filled" | "cancelled";
export type UserRole = "trader" | "admin";
export type WithdrawalStatus = "pending" | "approved" | "rejected";

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

export const assets: Asset[] = ["BTC", "ETH", "USDT"];

export const markets: Market[] = [
  {
    symbol: "BTC/USDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    lastPrice: 64000,
    pricePrecision: 2,
    quantityPrecision: 5
  },
  {
    symbol: "ETH/USDT",
    baseAsset: "ETH",
    quoteAsset: "USDT",
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
