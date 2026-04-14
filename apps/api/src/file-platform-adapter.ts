import type { Asset, MarketSymbol, OrderSide } from "@trading-platform/common";
import { TradingPlatform } from "./domain.js";
import type { PlatformRuntime } from "./platform-runtime.js";

export class FilePlatformAdapter implements PlatformRuntime {
  constructor(private readonly platform: TradingPlatform) {}

  subscribe(listener: Parameters<TradingPlatform["subscribe"]>[0]): ReturnType<TradingPlatform["subscribe"]> {
    return this.platform.subscribe(listener);
  }

  async register(email: string, password: string, name: string) {
    return this.platform.register(email, password, name);
  }

  async login(email: string, password: string) {
    return this.platform.login(email, password);
  }

  async getUserByToken(token: string) {
    return this.platform.getUserByToken(token);
  }

  async getDashboard(userId: string) {
    return this.platform.getDashboard(userId);
  }

  async listMarkets() {
    return this.platform.listMarkets();
  }

  async updateReferencePrice(symbol: MarketSymbol, price: number) {
    this.platform.updateReferencePrice(symbol, price);
  }

  async getOrderBook(symbol: MarketSymbol) {
    return this.platform.getOrderBook(symbol);
  }

  async listRecentTrades(symbol: MarketSymbol) {
    return this.platform.listRecentTrades(symbol);
  }

  async placeOrder(userId: string, input: { symbol: MarketSymbol; side: OrderSide; price: number; quantity: number }) {
    return this.platform.placeOrder(userId, input);
  }

  async cancelOrder(userId: string, orderId: string) {
    return this.platform.cancelOrder(userId, orderId);
  }

  async createDeposit(userId: string, asset: Asset, amount: number) {
    return this.platform.createDeposit(userId, asset, amount);
  }

  async requestWithdrawal(userId: string, asset: Asset, amount: number, address: string) {
    return this.platform.requestWithdrawal(userId, asset, amount, address);
  }

  async listOrdersForUser(userId: string) {
    return this.platform.listOrdersForUser(userId);
  }

  async adminOverview() {
    return this.platform.adminOverview();
  }

  async adminUsers() {
    return this.platform.adminUsers();
  }

  async adminWithdrawals() {
    return this.platform.adminWithdrawals();
  }

  async reviewWithdrawal(adminUserId: string, withdrawalId: string, action: "approve" | "reject") {
    return this.platform.reviewWithdrawal(adminUserId, withdrawalId, action);
  }
}
