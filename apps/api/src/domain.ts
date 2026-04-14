import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assets,
  getMarket,
  markets,
  type AdminOverview,
  type Asset,
  type Balance,
  type DashboardState,
  type Deposit,
  type Market,
  type MarketSymbol,
  type Order,
  type OrderBookLevel,
  type OrderBookSnapshot,
  type OrderSide,
  type Trade,
  type User,
  type UserRole,
  type UserSession,
  type Withdrawal
} from "@trading-platform/common";

interface StoredUser extends User {
  passwordHash: string;
}

interface AppState {
  users: StoredUser[];
  sessions: UserSession[];
  balances: Record<string, Balance[]>;
  orders: Order[];
  trades: Trade[];
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  markets: Market[];
}

export type ActivityEvent =
  | { type: "market"; symbol: MarketSymbol }
  | { type: "private"; userId: string }
  | { type: "admin" };

const DEMO_USERS = [
  {
    id: "admin-1",
    email: "admin@trade.local",
    name: "Platform Admin",
    role: "admin" as UserRole,
    password: "Admin123!",
    balances: [
      { asset: "BTC" as Asset, available: 10, frozen: 0 },
      { asset: "ETH" as Asset, available: 100, frozen: 0 },
      { asset: "USD" as Asset, available: 500000, frozen: 0 }
    ]
  },
  {
    id: "trader-1",
    email: "trader@trade.local",
    name: "Demo Trader",
    role: "trader" as UserRole,
    password: "Trader123!",
    balances: [
      { asset: "BTC" as Asset, available: 2.5, frozen: 0 },
      { asset: "ETH" as Asset, available: 20, frozen: 0 },
      { asset: "USD" as Asset, available: 250000, frozen: 0 }
    ]
  }
];

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function round(value: number, digits = 8): number {
  return Number(value.toFixed(digits));
}

function normalizeSymbol(symbol: string): MarketSymbol {
  if (symbol === "BTC/USDT") {
    return "BTC/USD";
  }

  if (symbol === "ETH/USDT") {
    return "ETH/USD";
  }

  return symbol as MarketSymbol;
}

function normalizeAsset(asset: string): Asset {
  if (asset === "USDT") {
    return "USD";
  }

  return asset as Asset;
}

function normalizeState(state: AppState): AppState {
  return {
    ...state,
    balances: Object.fromEntries(
      Object.entries(state.balances ?? {}).map(([userId, balances]) => [
        userId,
        balances.map((balance) => ({
          ...balance,
          asset: normalizeAsset(balance.asset)
        }))
      ])
    ) as Record<string, Balance[]>,
    deposits: (state.deposits ?? []).map((deposit) => ({
      ...deposit,
      asset: normalizeAsset(deposit.asset)
    })),
    withdrawals: (state.withdrawals ?? []).map((withdrawal) => ({
      ...withdrawal,
      asset: normalizeAsset(withdrawal.asset)
    })),
    orders: (state.orders ?? []).map((order) => ({
      ...order,
      symbol: normalizeSymbol(order.symbol)
    })),
    trades: (state.trades ?? []).map((trade) => ({
      ...trade,
      symbol: normalizeSymbol(trade.symbol)
    })),
    markets: (state.markets ?? markets).map((market) => ({
      ...market,
      symbol: normalizeSymbol(market.symbol),
      baseAsset: normalizeAsset(market.baseAsset),
      quoteAsset: normalizeAsset(market.quoteAsset)
    }))
  };
}

export class TradingPlatform {
  private readonly filePath: string;

  private readonly activityListeners = new Set<(event: ActivityEvent) => void>();

  private state: AppState;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = this.load();
    this.seedMarketLiquidity();
  }

  private load(): AppState {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (fs.existsSync(this.filePath)) {
      return normalizeState(JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as AppState);
    }

    const initialState: AppState = {
      users: DEMO_USERS.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: now(),
        passwordHash: hashPassword(user.password)
      })),
      sessions: [],
      balances: Object.fromEntries(
        DEMO_USERS.map((user) => [user.id, clone(user.balances)])
      ) as Record<string, Balance[]>,
      orders: [],
      trades: [],
      deposits: [],
      withdrawals: [],
      markets: clone(markets)
    };

    fs.writeFileSync(this.filePath, JSON.stringify(initialState, null, 2));
    return initialState;
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  private seedMarketLiquidity(): void {
    if (this.state.orders.length > 0) {
      return;
    }

    const admin = this.state.users.find((user) => user.role === "admin");
    if (!admin) {
      return;
    }

    this.placeOrder(admin.id, { symbol: "BTC/USD", side: "sell", price: 64200, quantity: 0.35 });
    this.placeOrder(admin.id, { symbol: "BTC/USD", side: "buy", price: 63850, quantity: 0.4 });
    this.placeOrder(admin.id, { symbol: "ETH/USD", side: "sell", price: 3220, quantity: 4 });
    this.placeOrder(admin.id, { symbol: "ETH/USD", side: "buy", price: 3180, quantity: 4.5 });
  }

  subscribe(listener: (event: ActivityEvent) => void): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  private emit(event: ActivityEvent): void {
    for (const listener of this.activityListeners) {
      listener(event);
    }
  }

  private getStoredUserByEmail(email: string): StoredUser | undefined {
    return this.state.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  private getStoredUser(userId: string): StoredUser {
    const user = this.state.users.find((item) => item.id === userId);
    if (!user) {
      throw new Error("User not found.");
    }

    return user;
  }

  private sanitizeUser(user: StoredUser): User {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  private getBalances(userId: string): Balance[] {
    if (!this.state.balances[userId]) {
      this.state.balances[userId] = assets.map((asset) => ({ asset, available: 0, frozen: 0 }));
    }

    return this.state.balances[userId];
  }

  private getBalance(userId: string, asset: Asset): Balance {
    const balance = this.getBalances(userId).find((entry) => entry.asset === asset);
    if (!balance) {
      throw new Error(`Missing balance for ${asset}.`);
    }

    return balance;
  }

  private assertSufficientAvailable(userId: string, asset: Asset, amount: number): void {
    const balance = this.getBalance(userId, asset);
    if (balance.available < amount) {
      throw new Error(`Insufficient ${asset} balance.`);
    }
  }

  private reserveForOrder(userId: string, side: OrderSide, symbol: MarketSymbol, price: number, quantity: number): void {
    const market = getMarket(symbol);

    if (side === "buy") {
      const required = round(price * quantity);
      this.assertSufficientAvailable(userId, market.quoteAsset, required);
      const quoteBalance = this.getBalance(userId, market.quoteAsset);
      quoteBalance.available = round(quoteBalance.available - required);
      quoteBalance.frozen = round(quoteBalance.frozen + required);
      return;
    }

    this.assertSufficientAvailable(userId, market.baseAsset, quantity);
    const baseBalance = this.getBalance(userId, market.baseAsset);
    baseBalance.available = round(baseBalance.available - quantity);
    baseBalance.frozen = round(baseBalance.frozen + quantity);
  }

  private releaseOrderFunds(order: Order): void {
    const market = getMarket(order.symbol);

    if (order.side === "buy") {
      const reserved = round(order.remainingQuantity * order.price);
      const quoteBalance = this.getBalance(order.userId, market.quoteAsset);
      quoteBalance.frozen = round(quoteBalance.frozen - reserved);
      quoteBalance.available = round(quoteBalance.available + reserved);
      return;
    }

    const baseBalance = this.getBalance(order.userId, market.baseAsset);
    baseBalance.frozen = round(baseBalance.frozen - order.remainingQuantity);
    baseBalance.available = round(baseBalance.available + order.remainingQuantity);
  }

  private updateOrderStatus(order: Order): void {
    if (order.remainingQuantity <= 0) {
      order.remainingQuantity = 0;
      order.status = "filled";
    } else if (order.remainingQuantity < order.quantity) {
      order.status = "partially_filled";
    } else {
      order.status = "open";
    }

    order.updatedAt = now();
  }

  private getMarketOrders(symbol: MarketSymbol, side?: OrderSide): Order[] {
    return this.state.orders
      .filter((order) => order.symbol === symbol && order.status !== "cancelled" && order.status !== "filled")
      .filter((order) => (side ? order.side === side : true));
  }

  private getBestMatch(incoming: Order): Order | undefined {
    const candidates = this.getMarketOrders(incoming.symbol, incoming.side === "buy" ? "sell" : "buy")
      .filter((order) => (incoming.side === "buy" ? order.price <= incoming.price : order.price >= incoming.price))
      .sort((left, right) => {
        if (incoming.side === "buy") {
          if (left.price !== right.price) {
            return left.price - right.price;
          }
        } else if (left.price !== right.price) {
          return right.price - left.price;
        }

        return left.createdAt.localeCompare(right.createdAt);
      });

    return candidates[0];
  }

  private settleTrade(taker: Order, maker: Order, tradedQuantity: number, tradedPrice: number): void {
    const market = getMarket(taker.symbol);
    const tradeValue = round(tradedPrice * tradedQuantity);

    if (taker.side === "buy") {
      const buyerQuote = this.getBalance(taker.userId, market.quoteAsset);
      const sellerBase = this.getBalance(maker.userId, market.baseAsset);
      const buyerBase = this.getBalance(taker.userId, market.baseAsset);
      const sellerQuote = this.getBalance(maker.userId, market.quoteAsset);

      buyerQuote.frozen = round(buyerQuote.frozen - tradedQuantity * taker.price);
      buyerQuote.available = round(buyerQuote.available + (taker.price - tradedPrice) * tradedQuantity);
      buyerBase.available = round(buyerBase.available + tradedQuantity);

      sellerBase.frozen = round(sellerBase.frozen - tradedQuantity);
      sellerQuote.available = round(sellerQuote.available + tradeValue);
    } else {
      const sellerBase = this.getBalance(taker.userId, market.baseAsset);
      const sellerQuote = this.getBalance(taker.userId, market.quoteAsset);
      const buyerQuote = this.getBalance(maker.userId, market.quoteAsset);
      const buyerBase = this.getBalance(maker.userId, market.baseAsset);

      sellerBase.frozen = round(sellerBase.frozen - tradedQuantity);
      sellerQuote.available = round(sellerQuote.available + tradeValue);

      buyerQuote.frozen = round(buyerQuote.frozen - tradedQuantity * maker.price);
      buyerQuote.available = round(buyerQuote.available + (maker.price - tradedPrice) * tradedQuantity);
      buyerBase.available = round(buyerBase.available + tradedQuantity);
    }

    taker.remainingQuantity = round(taker.remainingQuantity - tradedQuantity);
    maker.remainingQuantity = round(maker.remainingQuantity - tradedQuantity);
    this.updateOrderStatus(taker);
    this.updateOrderStatus(maker);

    const trade: Trade = {
      id: id("trade"),
      symbol: taker.symbol,
      price: tradedPrice,
      quantity: tradedQuantity,
      buyOrderId: taker.side === "buy" ? taker.id : maker.id,
      sellOrderId: taker.side === "sell" ? taker.id : maker.id,
      makerSide: maker.side,
      takerOrderId: taker.id,
      buyerUserId: taker.side === "buy" ? taker.userId : maker.userId,
      sellerUserId: taker.side === "sell" ? taker.userId : maker.userId,
      createdAt: now()
    };

    this.state.trades.unshift(trade);

    const trackedMarket = this.state.markets.find((item) => item.symbol === taker.symbol);
    if (trackedMarket) {
      trackedMarket.lastPrice = tradedPrice;
    }
  }

  register(email: string, password: string, name: string): User {
    if (this.getStoredUserByEmail(email)) {
      throw new Error("Email is already registered.");
    }

    const user: StoredUser = {
      id: id("user"),
      email,
      name,
      role: "trader",
      createdAt: now(),
      passwordHash: hashPassword(password)
    };

    this.state.users.push(user);
    this.state.balances[user.id] = assets.map((asset) => ({
      asset,
      available: asset === "USD" ? 25000 : 0,
      frozen: 0
    }));
    this.persist();
    return this.sanitizeUser(user);
  }

  login(email: string, password: string): { token: string; user: User } {
    const user = this.getStoredUserByEmail(email);
    if (!user || user.passwordHash !== hashPassword(password)) {
      throw new Error("Invalid credentials.");
    }

    const session: UserSession = {
      token: id("token"),
      userId: user.id,
      createdAt: now()
    };

    this.state.sessions.push(session);
    this.persist();

    return {
      token: session.token,
      user: this.sanitizeUser(user)
    };
  }

  getUserByToken(token: string): User | undefined {
    const session = this.state.sessions.find((item) => item.token === token);
    if (!session) {
      return undefined;
    }

    return this.sanitizeUser(this.getStoredUser(session.userId));
  }

  getDashboard(userId: string): DashboardState {
    return {
      me: this.sanitizeUser(this.getStoredUser(userId)),
      balances: clone(this.getBalances(userId)),
      openOrders: clone(
        this.state.orders
          .filter((order) => order.userId === userId && (order.status === "open" || order.status === "partially_filled"))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      ),
      withdrawals: clone(
        this.state.withdrawals
          .filter((withdrawal) => withdrawal.userId === userId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      )
    };
  }

  listMarkets(): Market[] {
    return clone(this.state.markets);
  }

  updateReferencePrice(symbol: MarketSymbol, price: number): void {
    const market = this.state.markets.find((item) => item.symbol === symbol);
    if (!market || price <= 0) {
      return;
    }

    market.lastPrice = round(price, market.pricePrecision);
    this.persist();
    this.emit({ type: "market", symbol });
  }

  getOrderBook(symbol: MarketSymbol): OrderBookSnapshot {
    const aggregate = (side: OrderSide): OrderBookLevel[] => {
      const levels = new Map<number, number>();
      for (const order of this.getMarketOrders(symbol, side)) {
        levels.set(order.price, round((levels.get(order.price) ?? 0) + order.remainingQuantity));
      }

      return [...levels.entries()]
        .map(([price, quantity]) => ({ price, quantity }))
        .sort((left, right) => (side === "buy" ? right.price - left.price : left.price - right.price))
        .slice(0, 15);
    };

    return {
      symbol,
      bids: aggregate("buy"),
      asks: aggregate("sell"),
      lastPrice: getMarket(symbol).lastPrice
    };
  }

  listRecentTrades(symbol: MarketSymbol): Trade[] {
    return clone(this.state.trades.filter((trade) => trade.symbol === symbol).slice(0, 25));
  }

  placeOrder(userId: string, input: { symbol: MarketSymbol; side: OrderSide; price: number; quantity: number }): Order {
    const { symbol, side, price, quantity } = input;
    if (price <= 0 || quantity <= 0) {
      throw new Error("Price and quantity must be positive.");
    }

    this.reserveForOrder(userId, side, symbol, price, quantity);

    const order: Order = {
      id: id("order"),
      userId,
      symbol,
      side,
      type: "limit",
      price: round(price),
      quantity: round(quantity),
      remainingQuantity: round(quantity),
      status: "open",
      createdAt: now(),
      updatedAt: now()
    };

    this.state.orders.push(order);

    while (order.remainingQuantity > 0) {
      const bestMatch = this.getBestMatch(order);
      if (!bestMatch) {
        break;
      }

      const tradedQuantity = Math.min(order.remainingQuantity, bestMatch.remainingQuantity);
      const tradedPrice = bestMatch.price;
      this.settleTrade(order, bestMatch, tradedQuantity, tradedPrice);
    }

    this.updateOrderStatus(order);
    this.persist();
    this.emit({ type: "market", symbol });
    this.emit({ type: "private", userId });
    this.emit({ type: "admin" });

    return clone(order);
  }

  cancelOrder(userId: string, orderId: string): Order {
    const order = this.state.orders.find((item) => item.id === orderId && item.userId === userId);
    if (!order) {
      throw new Error("Order not found.");
    }

    if (order.status === "filled" || order.status === "cancelled") {
      throw new Error("Order is not cancelable.");
    }

    this.releaseOrderFunds(order);
    order.status = "cancelled";
    order.updatedAt = now();
    this.persist();
    this.emit({ type: "market", symbol: order.symbol });
    this.emit({ type: "private", userId });
    this.emit({ type: "admin" });
    return clone(order);
  }

  createDeposit(userId: string, asset: Asset, amount: number): Deposit {
    if (amount <= 0) {
      throw new Error("Deposit amount must be positive.");
    }

    const deposit: Deposit = {
      id: id("dep"),
      userId,
      asset,
      amount: round(amount),
      createdAt: now()
    };

    const balance = this.getBalance(userId, asset);
    balance.available = round(balance.available + amount);
    this.state.deposits.unshift(deposit);
    this.persist();
    this.emit({ type: "private", userId });
    this.emit({ type: "admin" });
    return clone(deposit);
  }

  requestWithdrawal(userId: string, asset: Asset, amount: number, address: string): Withdrawal {
    if (amount <= 0) {
      throw new Error("Withdrawal amount must be positive.");
    }

    this.assertSufficientAvailable(userId, asset, amount);
    const balance = this.getBalance(userId, asset);
    balance.available = round(balance.available - amount);
    balance.frozen = round(balance.frozen + amount);

    const withdrawal: Withdrawal = {
      id: id("wd"),
      userId,
      asset,
      amount: round(amount),
      address,
      status: "pending",
      createdAt: now()
    };

    this.state.withdrawals.unshift(withdrawal);
    this.persist();
    this.emit({ type: "private", userId });
    this.emit({ type: "admin" });
    return clone(withdrawal);
  }

  listOrdersForUser(userId: string): Order[] {
    return clone(
      this.state.orders
        .filter((order) => order.userId === userId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    );
  }

  adminOverview(): AdminOverview {
    const dailyVolumeUsd = this.state.trades
      .filter((trade) => Date.now() - new Date(trade.createdAt).getTime() < 24 * 60 * 60 * 1000)
      .reduce((sum, trade) => sum + trade.price * trade.quantity, 0);

    return {
      users: this.state.users.length,
      openOrders: this.state.orders.filter((order) => order.status === "open" || order.status === "partially_filled").length,
      trades: this.state.trades.length,
      pendingWithdrawals: this.state.withdrawals.filter((withdrawal) => withdrawal.status === "pending").length,
      dailyVolumeUsd: round(dailyVolumeUsd, 2)
    };
  }

  adminUsers(): User[] {
    return clone(this.state.users.map((user) => this.sanitizeUser(user)));
  }

  adminWithdrawals(): Withdrawal[] {
    return clone(this.state.withdrawals);
  }

  reviewWithdrawal(adminUserId: string, withdrawalId: string, action: "approve" | "reject"): Withdrawal {
    const reviewer = this.getStoredUser(adminUserId);
    if (reviewer.role !== "admin") {
      throw new Error("Only admins can review withdrawals.");
    }

    const withdrawal = this.state.withdrawals.find((item) => item.id === withdrawalId);
    if (!withdrawal) {
      throw new Error("Withdrawal not found.");
    }

    if (withdrawal.status !== "pending") {
      throw new Error("Withdrawal has already been reviewed.");
    }

    const balance = this.getBalance(withdrawal.userId, withdrawal.asset);
    balance.frozen = round(balance.frozen - withdrawal.amount);

    if (action === "reject") {
      balance.available = round(balance.available + withdrawal.amount);
      withdrawal.status = "rejected";
    } else {
      withdrawal.status = "approved";
    }

    withdrawal.reviewedAt = now();
    withdrawal.reviewerId = adminUserId;
    this.persist();
    this.emit({ type: "private", userId: withdrawal.userId });
    this.emit({ type: "admin" });

    return clone(withdrawal);
  }
}
