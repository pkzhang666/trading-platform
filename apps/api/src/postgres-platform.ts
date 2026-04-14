import crypto from "node:crypto";
import { Pool, type PoolClient } from "pg";
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
  type Withdrawal
} from "@trading-platform/common";
import type { ActivityEvent } from "./domain.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import type { PlatformRuntime } from "./platform-runtime.js";

interface BootstrapOptions {
  passwordPepper: string;
  bootstrapUsers: Array<{
    id: string;
    email: string;
    name: string;
    role: UserRole;
    password: string;
    balances: Array<{ asset: Asset; available: number; locked?: number }>;
  }>;
}

type DbClient = Pool | PoolClient;

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function round(value: number, digits = 8): number {
  return Number(value.toFixed(digits));
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function accountKey(userId: string, asset: Asset, scope: "available" | "locked"): string {
  return `user:${userId}:${asset}:${scope}`;
}

function externalAccountKey(asset: Asset): string {
  return `system:external:${asset}`;
}

function sanitizeUser(row: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    symbol: String(row.symbol) as MarketSymbol,
    side: String(row.side) as OrderSide,
    type: "limit",
    price: asNumber(row.price),
    quantity: asNumber(row.quantity),
    remainingQuantity: asNumber(row.remaining_quantity),
    status: String(row.status) as Order["status"],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapTrade(row: Record<string, unknown>): Trade {
  return {
    id: String(row.id),
    symbol: String(row.symbol) as MarketSymbol,
    price: asNumber(row.price),
    quantity: asNumber(row.quantity),
    buyOrderId: String(row.buy_order_id),
    sellOrderId: String(row.sell_order_id),
    makerSide: String(row.maker_side) as OrderSide,
    takerOrderId: String(row.taker_order_id),
    buyerUserId: String(row.buyer_user_id),
    sellerUserId: String(row.seller_user_id),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapDeposit(row: Record<string, unknown>): Deposit {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    asset: String(row.asset) as Asset,
    amount: asNumber(row.amount),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapWithdrawal(row: Record<string, unknown>): Withdrawal {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    asset: String(row.asset) as Asset,
    amount: asNumber(row.amount),
    address: String(row.address),
    status: String(row.status) as Withdrawal["status"],
    createdAt: new Date(String(row.created_at)).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)).toISOString() : undefined,
    reviewerId: row.reviewer_id ? String(row.reviewer_id) : undefined
  };
}

export class PostgresTradingPlatform implements PlatformRuntime {
  private readonly activityListeners = new Set<(event: ActivityEvent) => void>();

  constructor(
    private readonly pool: Pool,
    private readonly options: BootstrapOptions
  ) {}

  static async create(connectionString: string, options: BootstrapOptions): Promise<PostgresTradingPlatform> {
    const pool = new Pool({
      connectionString,
      max: 10
    });

    const platform = new PostgresTradingPlatform(pool, options);
    await platform.init();
    return platform;
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        password_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS markets (
        symbol TEXT PRIMARY KEY,
        base_asset TEXT NOT NULL,
        quote_asset TEXT NOT NULL,
        last_price NUMERIC NOT NULL,
        price_precision INTEGER NOT NULL,
        quantity_precision INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        symbol TEXT NOT NULL REFERENCES markets(symbol),
        side TEXT NOT NULL,
        type TEXT NOT NULL,
        price NUMERIC NOT NULL,
        quantity NUMERIC NOT NULL,
        remaining_quantity NUMERIC NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_orders_open ON orders(symbol, side, status, price, created_at);

      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL REFERENCES markets(symbol),
        price NUMERIC NOT NULL,
        quantity NUMERIC NOT NULL,
        buy_order_id TEXT NOT NULL REFERENCES orders(id),
        sell_order_id TEXT NOT NULL REFERENCES orders(id),
        maker_side TEXT NOT NULL,
        taker_order_id TEXT NOT NULL REFERENCES orders(id),
        buyer_user_id TEXT NOT NULL REFERENCES users(id),
        seller_user_id TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deposits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        asset TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        asset TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        reviewed_at TIMESTAMPTZ NULL,
        reviewer_id TEXT NULL REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS ledger_accounts (
        account_key TEXT PRIMARY KEY,
        user_id TEXT NULL REFERENCES users(id) ON DELETE CASCADE,
        asset TEXT NOT NULL,
        scope TEXT NOT NULL,
        current_balance NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL,
        UNIQUE (user_id, asset, scope)
      );

      CREATE TABLE IF NOT EXISTS ledger_journals (
        id TEXT PRIMARY KEY,
        reference_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id BIGSERIAL PRIMARY KEY,
        journal_id TEXT NOT NULL REFERENCES ledger_journals(id) ON DELETE CASCADE,
        account_key TEXT NOT NULL REFERENCES ledger_accounts(account_key),
        asset TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    await this.seedMarkets();
    await this.ensureSystemAccounts();
    for (const bootstrapUser of this.options.bootstrapUsers) {
      await this.ensureBootstrapUser(bootstrapUser);
    }
    await this.seedMarketLiquidity();
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

  private async seedMarkets(): Promise<void> {
    for (const market of markets) {
      await this.pool.query(
        `
          INSERT INTO markets (symbol, base_asset, quote_asset, last_price, price_precision, quantity_precision)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (symbol) DO UPDATE
          SET base_asset = EXCLUDED.base_asset,
              quote_asset = EXCLUDED.quote_asset,
              price_precision = EXCLUDED.price_precision,
              quantity_precision = EXCLUDED.quantity_precision
        `,
        [
          market.symbol,
          market.baseAsset,
          market.quoteAsset,
          market.lastPrice,
          market.pricePrecision,
          market.quantityPrecision
        ]
      );
    }
  }

  private async ensureSystemAccounts(): Promise<void> {
    for (const asset of assets) {
      await this.pool.query(
        `
          INSERT INTO ledger_accounts (account_key, user_id, asset, scope, current_balance, created_at)
          VALUES ($1, NULL, $2, 'external', 0, $3)
          ON CONFLICT (account_key) DO NOTHING
        `,
        [externalAccountKey(asset), asset, now()]
      );
    }
  }

  private async ensureBootstrapUser(user: BootstrapOptions["bootstrapUsers"][number]): Promise<void> {
    await this.withTransaction(async (client) => {
      const existing = await client.query("SELECT id FROM users WHERE email = $1", [user.email]);
      const userId = existing.rowCount === 0 ? user.id : String(existing.rows[0].id);

      if (existing.rowCount === 0) {
        await client.query(
          `
            INSERT INTO users (id, email, name, role, created_at, password_hash)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [user.id, user.email, user.name, user.role, now(), hashPassword(user.password, this.options.passwordPepper)]
        );
      }

      await this.ensureUserAccounts(client, userId);

      if (existing.rowCount === 0) {
        for (const balance of user.balances) {
          if (balance.available > 0) {
            await this.postJournal(client, {
              referenceType: "bootstrap",
              referenceId: `${user.id}-${balance.asset}`,
              description: `Bootstrap funding for ${user.email}`,
              transfers: [
                {
                  asset: balance.asset,
                  fromAccountKey: externalAccountKey(balance.asset),
                  toAccountKey: accountKey(userId, balance.asset, "available"),
                  amount: balance.available
                }
              ]
            });
          }
        }
      }
    });
  }

  private async seedMarketLiquidity(): Promise<void> {
    const existing = await this.pool.query("SELECT 1 FROM orders LIMIT 1");
    if (existing.rowCount && existing.rowCount > 0) {
      return;
    }

    const admin = await this.pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1");
    if (!admin.rowCount) {
      return;
    }

    const adminUserId = String(admin.rows[0].id);
    await this.placeOrder(adminUserId, { symbol: "BTC/USD", side: "sell", price: 64200, quantity: 0.35 });
    await this.placeOrder(adminUserId, { symbol: "BTC/USD", side: "buy", price: 63850, quantity: 0.4 });
    await this.placeOrder(adminUserId, { symbol: "ETH/USD", side: "sell", price: 3220, quantity: 4 });
    await this.placeOrder(adminUserId, { symbol: "ETH/USD", side: "buy", price: 3180, quantity: 4.5 });
  }

  private async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureUserAccounts(client: DbClient, userId: string): Promise<void> {
    for (const asset of assets) {
      for (const scope of ["available", "locked"] as const) {
        await client.query(
          `
            INSERT INTO ledger_accounts (account_key, user_id, asset, scope, current_balance, created_at)
            VALUES ($1, $2, $3, $4, 0, $5)
            ON CONFLICT (account_key) DO NOTHING
          `,
          [accountKey(userId, asset, scope), userId, asset, scope, now()]
        );
      }
    }
  }

  private async getStoredUserByEmail(client: DbClient, email: string): Promise<{ id: string; email: string; name: string; role: UserRole; created_at: string; password_hash: string } | undefined> {
    const result = await client.query(
      "SELECT id, email, name, role, created_at, password_hash FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );
    return result.rows[0] as
      | { id: string; email: string; name: string; role: UserRole; created_at: string; password_hash: string }
      | undefined;
  }

  private async getStoredUser(client: DbClient, userId: string): Promise<{ id: string; email: string; name: string; role: UserRole; created_at: string; password_hash: string }> {
    const result = await client.query(
      "SELECT id, email, name, role, created_at, password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (!result.rowCount) {
      throw new Error("User not found.");
    }

    return result.rows[0] as { id: string; email: string; name: string; role: UserRole; created_at: string; password_hash: string };
  }

  private async listBalances(client: DbClient, userId: string): Promise<Balance[]> {
    const result = await client.query(
      `
        SELECT asset,
               COALESCE(MAX(CASE WHEN scope = 'available' THEN current_balance END), 0) AS available,
               COALESCE(MAX(CASE WHEN scope = 'locked' THEN current_balance END), 0) AS locked
        FROM ledger_accounts
        WHERE user_id = $1
        GROUP BY asset
      `,
      [userId]
    );

    const balanceByAsset = new Map(
      result.rows.map((row) => [
        String(row.asset) as Asset,
        {
          asset: String(row.asset) as Asset,
          available: round(asNumber(row.available)),
          frozen: round(asNumber(row.locked))
        }
      ])
    );

    return assets.map((asset) => balanceByAsset.get(asset) ?? { asset, available: 0, frozen: 0 });
  }

  private async postJournal(
    client: PoolClient,
    options: {
      referenceType: string;
      referenceId: string;
      description: string;
      transfers: Array<{ asset: Asset; fromAccountKey: string; toAccountKey: string; amount: number }>;
    }
  ): Promise<void> {
    const journalId = id("journal");
    const deltas = new Map<string, { asset: Asset; amount: number }>();

    for (const transfer of options.transfers) {
      if (transfer.amount <= 0) {
        continue;
      }

      const currentFrom = deltas.get(transfer.fromAccountKey);
      deltas.set(transfer.fromAccountKey, {
        asset: transfer.asset,
        amount: round((currentFrom?.amount ?? 0) - transfer.amount)
      });

      const currentTo = deltas.get(transfer.toAccountKey);
      deltas.set(transfer.toAccountKey, {
        asset: transfer.asset,
        amount: round((currentTo?.amount ?? 0) + transfer.amount)
      });
    }

    const accountKeys = [...deltas.keys()];
    if (accountKeys.length === 0) {
      return;
    }

    const lockedAccounts = await client.query(
      "SELECT account_key, current_balance FROM ledger_accounts WHERE account_key = ANY($1::text[]) FOR UPDATE",
      [accountKeys]
    );

    const balances = new Map<string, number>(
      lockedAccounts.rows.map((row) => [String(row.account_key), asNumber(row.current_balance)])
    );

    for (const accountKeyValue of accountKeys) {
      if (!balances.has(accountKeyValue)) {
        throw new Error(`Ledger account ${accountKeyValue} is missing.`);
      }
    }

    for (const [accountKeyValue, delta] of deltas.entries()) {
      const nextBalance = round((balances.get(accountKeyValue) ?? 0) + delta.amount);
      if (nextBalance < -0.00000001) {
        throw new Error("Ledger balance would become negative.");
      }
    }

    await client.query(
      `
        INSERT INTO ledger_journals (id, reference_type, reference_id, description, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [journalId, options.referenceType, options.referenceId, options.description, now()]
    );

    for (const transfer of options.transfers) {
      if (transfer.amount <= 0) {
        continue;
      }

      await client.query(
        `
          INSERT INTO ledger_entries (journal_id, account_key, asset, amount, created_at)
          VALUES ($1, $2, $3, $4, $5),
                 ($1, $6, $3, $7, $5)
        `,
        [
          journalId,
          transfer.fromAccountKey,
          transfer.asset,
          -transfer.amount,
          now(),
          transfer.toAccountKey,
          transfer.amount
        ]
      );
    }

    for (const [accountKeyValue, delta] of deltas.entries()) {
      await client.query(
        "UPDATE ledger_accounts SET current_balance = current_balance + $1 WHERE account_key = $2",
        [delta.amount, accountKeyValue]
      );
    }
  }

  private async getBestMatchTx(
    client: PoolClient,
    incomingSymbol: MarketSymbol,
    incomingSide: OrderSide,
    incomingPrice: number
  ): Promise<Order | undefined> {
    if (incomingSide === "buy") {
      const result = await client.query(
        `
          SELECT *
          FROM orders
          WHERE symbol = $1
            AND side = 'sell'
            AND status IN ('open', 'partially_filled')
            AND price <= $2
          ORDER BY price ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
        [incomingSymbol, incomingPrice]
      );

      return result.rows[0] ? mapOrder(result.rows[0]) : undefined;
    }

    const result = await client.query(
      `
        SELECT *
        FROM orders
        WHERE symbol = $1
          AND side = 'buy'
          AND status IN ('open', 'partially_filled')
          AND price >= $2
        ORDER BY price DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `,
      [incomingSymbol, incomingPrice]
    );

    return result.rows[0] ? mapOrder(result.rows[0]) : undefined;
  }

  private async updateOrderTx(client: PoolClient, order: Order): Promise<void> {
    await client.query(
      `
        UPDATE orders
        SET remaining_quantity = $2,
            status = $3,
            updated_at = $4
        WHERE id = $1
      `,
      [order.id, order.remainingQuantity, order.status, order.updatedAt]
    );
  }

  private async reserveForOrderTx(
    client: PoolClient,
    userId: string,
    side: OrderSide,
    symbol: MarketSymbol,
    price: number,
    quantity: number,
    referenceId: string
  ): Promise<void> {
    const market = getMarket(symbol);
    if (side === "buy") {
      const amount = round(price * quantity);
      await this.postJournal(client, {
        referenceType: "order_reserve",
        referenceId,
        description: `Reserve ${market.quoteAsset} for ${symbol} buy order`,
        transfers: [
          {
            asset: market.quoteAsset,
            fromAccountKey: accountKey(userId, market.quoteAsset, "available"),
            toAccountKey: accountKey(userId, market.quoteAsset, "locked"),
            amount
          }
        ]
      });
      return;
    }

    await this.postJournal(client, {
      referenceType: "order_reserve",
      referenceId,
      description: `Reserve ${market.baseAsset} for ${symbol} sell order`,
      transfers: [
        {
          asset: market.baseAsset,
          fromAccountKey: accountKey(userId, market.baseAsset, "available"),
          toAccountKey: accountKey(userId, market.baseAsset, "locked"),
          amount: quantity
        }
      ]
    });
  }

  private async releaseOrderFundsTx(client: PoolClient, order: Order, reason: string): Promise<void> {
    const market = getMarket(order.symbol);
    if (order.side === "buy") {
      const amount = round(order.remainingQuantity * order.price);
      await this.postJournal(client, {
        referenceType: "order_release",
        referenceId: order.id,
        description: reason,
        transfers: [
          {
            asset: market.quoteAsset,
            fromAccountKey: accountKey(order.userId, market.quoteAsset, "locked"),
            toAccountKey: accountKey(order.userId, market.quoteAsset, "available"),
            amount
          }
        ]
      });
      return;
    }

    await this.postJournal(client, {
      referenceType: "order_release",
      referenceId: order.id,
      description: reason,
      transfers: [
        {
          asset: market.baseAsset,
          fromAccountKey: accountKey(order.userId, market.baseAsset, "locked"),
          toAccountKey: accountKey(order.userId, market.baseAsset, "available"),
          amount: order.remainingQuantity
        }
      ]
    });
  }

  private async settleTradeTx(client: PoolClient, taker: Order, maker: Order, tradedQuantity: number, tradedPrice: number): Promise<Trade> {
    const market = getMarket(taker.symbol);
    const tradeValue = round(tradedPrice * tradedQuantity);
    const transfers: Array<{ asset: Asset; fromAccountKey: string; toAccountKey: string; amount: number }> = [];

    if (taker.side === "buy") {
      transfers.push({
        asset: market.quoteAsset,
        fromAccountKey: accountKey(taker.userId, market.quoteAsset, "locked"),
        toAccountKey: accountKey(maker.userId, market.quoteAsset, "available"),
        amount: tradeValue
      });
      transfers.push({
        asset: market.baseAsset,
        fromAccountKey: accountKey(maker.userId, market.baseAsset, "locked"),
        toAccountKey: accountKey(taker.userId, market.baseAsset, "available"),
        amount: tradedQuantity
      });

      const refund = round((taker.price - tradedPrice) * tradedQuantity);
      if (refund > 0) {
        transfers.push({
          asset: market.quoteAsset,
          fromAccountKey: accountKey(taker.userId, market.quoteAsset, "locked"),
          toAccountKey: accountKey(taker.userId, market.quoteAsset, "available"),
          amount: refund
        });
      }
    } else {
      transfers.push({
        asset: market.baseAsset,
        fromAccountKey: accountKey(taker.userId, market.baseAsset, "locked"),
        toAccountKey: accountKey(maker.userId, market.baseAsset, "available"),
        amount: tradedQuantity
      });
      transfers.push({
        asset: market.quoteAsset,
        fromAccountKey: accountKey(maker.userId, market.quoteAsset, "locked"),
        toAccountKey: accountKey(taker.userId, market.quoteAsset, "available"),
        amount: tradeValue
      });

      const refund = round((maker.price - tradedPrice) * tradedQuantity);
      if (refund > 0) {
        transfers.push({
          asset: market.quoteAsset,
          fromAccountKey: accountKey(maker.userId, market.quoteAsset, "locked"),
          toAccountKey: accountKey(maker.userId, market.quoteAsset, "available"),
          amount: refund
        });
      }
    }

    const tradeId = id("trade");
    await this.postJournal(client, {
      referenceType: "trade",
      referenceId: tradeId,
      description: `Settle trade for ${taker.symbol}`,
      transfers
    });

    taker.remainingQuantity = round(taker.remainingQuantity - tradedQuantity);
    maker.remainingQuantity = round(maker.remainingQuantity - tradedQuantity);
    taker.status = taker.remainingQuantity === 0 ? "filled" : taker.remainingQuantity < taker.quantity ? "partially_filled" : "open";
    maker.status = maker.remainingQuantity === 0 ? "filled" : maker.remainingQuantity < maker.quantity ? "partially_filled" : "open";
    taker.updatedAt = now();
    maker.updatedAt = now();

    await this.updateOrderTx(client, taker);
    await this.updateOrderTx(client, maker);

    const trade: Trade = {
      id: tradeId,
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

    await client.query(
      `
        INSERT INTO trades (
          id, symbol, price, quantity, buy_order_id, sell_order_id, maker_side, taker_order_id, buyer_user_id, seller_user_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        trade.id,
        trade.symbol,
        trade.price,
        trade.quantity,
        trade.buyOrderId,
        trade.sellOrderId,
        trade.makerSide,
        trade.takerOrderId,
        trade.buyerUserId,
        trade.sellerUserId,
        trade.createdAt
      ]
    );

    await client.query("UPDATE markets SET last_price = $2 WHERE symbol = $1", [taker.symbol, tradedPrice]);
    return trade;
  }

  async register(email: string, password: string, name: string): Promise<User> {
    return this.withTransaction(async (client) => {
      const existing = await this.getStoredUserByEmail(client, email);
      if (existing) {
        throw new Error("Email is already registered.");
      }

      const userId = id("user");
      const createdAt = now();
      await client.query(
        `
          INSERT INTO users (id, email, name, role, created_at, password_hash)
          VALUES ($1, $2, $3, 'trader', $4, $5)
        `,
        [userId, email, name, createdAt, hashPassword(password, this.options.passwordPepper)]
      );
      await this.ensureUserAccounts(client, userId);
      await this.postJournal(client, {
        referenceType: "registration_funding",
        referenceId: userId,
        description: "Bootstrap USD funding for new trader",
        transfers: [
          {
            asset: "USD",
            fromAccountKey: externalAccountKey("USD"),
            toAccountKey: accountKey(userId, "USD", "available"),
            amount: 25000
          }
        ]
      });

      return sanitizeUser({
        id: userId,
        email,
        name,
        role: "trader",
        created_at: createdAt
      });
    });
  }

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    return this.withTransaction(async (client) => {
      const user = await this.getStoredUserByEmail(client, email);
      if (!user || !verifyPassword(password, this.options.passwordPepper, user.password_hash)) {
        throw new Error("Invalid credentials.");
      }

      const token = id("token");
      await client.query(
        "INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)",
        [token, user.id, now()]
      );

      return {
        token,
        user: sanitizeUser(user)
      };
    });
  }

  async getUserByToken(token: string): Promise<User | undefined> {
    const result = await this.pool.query(
      `
        SELECT u.id, u.email, u.name, u.role, u.created_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1
      `,
      [token]
    );

    return result.rows[0]
      ? sanitizeUser(result.rows[0] as { id: string; email: string; name: string; role: UserRole; created_at: string })
      : undefined;
  }

  async getDashboard(userId: string): Promise<DashboardState> {
    const [user, balances, orders, withdrawals] = await Promise.all([
      this.getStoredUser(this.pool, userId),
      this.listBalances(this.pool, userId),
      this.pool.query(
        `
          SELECT *
          FROM orders
          WHERE user_id = $1
            AND status IN ('open', 'partially_filled')
          ORDER BY created_at DESC
        `,
        [userId]
      ),
      this.pool.query("SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC", [userId])
    ]);

    return {
      me: sanitizeUser(user),
      balances,
      openOrders: orders.rows.map((row) => mapOrder(row as Record<string, unknown>)),
      withdrawals: withdrawals.rows.map((row) => mapWithdrawal(row as Record<string, unknown>))
    };
  }

  async listMarkets(): Promise<Market[]> {
    const result = await this.pool.query("SELECT * FROM markets ORDER BY symbol ASC");
    return result.rows.map((row) => ({
      symbol: String(row.symbol) as MarketSymbol,
      baseAsset: String(row.base_asset) as Asset,
      quoteAsset: String(row.quote_asset) as Asset,
      lastPrice: asNumber(row.last_price),
      pricePrecision: Number(row.price_precision),
      quantityPrecision: Number(row.quantity_precision)
    }));
  }

  async updateReferencePrice(symbol: MarketSymbol, price: number): Promise<void> {
    if (price <= 0) {
      return;
    }

    await this.pool.query("UPDATE markets SET last_price = $2 WHERE symbol = $1", [symbol, round(price, getMarket(symbol).pricePrecision)]);
    this.emit({ type: "market", symbol });
  }

  async getOrderBook(symbol: MarketSymbol): Promise<OrderBookSnapshot> {
    const bidsResult = await this.pool.query(
      `
        SELECT price, SUM(remaining_quantity) AS quantity
        FROM orders
        WHERE symbol = $1
          AND side = 'buy'
          AND status IN ('open', 'partially_filled')
        GROUP BY price
        ORDER BY price DESC
        LIMIT 15
      `,
      [symbol]
    );
    const asksResult = await this.pool.query(
      `
        SELECT price, SUM(remaining_quantity) AS quantity
        FROM orders
        WHERE symbol = $1
          AND side = 'sell'
          AND status IN ('open', 'partially_filled')
        GROUP BY price
        ORDER BY price ASC
        LIMIT 15
      `,
      [symbol]
    );
    const marketResult = await this.pool.query("SELECT last_price FROM markets WHERE symbol = $1", [symbol]);

    const mapLevels = (rows: Array<Record<string, unknown>>): OrderBookLevel[] =>
      rows.map((row) => ({
        price: asNumber(row.price),
        quantity: round(asNumber(row.quantity))
      }));

    return {
      symbol,
      bids: mapLevels(bidsResult.rows as Array<Record<string, unknown>>),
      asks: mapLevels(asksResult.rows as Array<Record<string, unknown>>),
      lastPrice: marketResult.rows[0] ? asNumber(marketResult.rows[0].last_price) : getMarket(symbol).lastPrice
    };
  }

  async listRecentTrades(symbol: MarketSymbol): Promise<Trade[]> {
    const result = await this.pool.query(
      "SELECT * FROM trades WHERE symbol = $1 ORDER BY created_at DESC LIMIT 25",
      [symbol]
    );
    return result.rows.map((row) => mapTrade(row as Record<string, unknown>));
  }

  async placeOrder(userId: string, input: { symbol: MarketSymbol; side: OrderSide; price: number; quantity: number }): Promise<Order> {
    const { symbol, side, price, quantity } = input;
    if (price <= 0 || quantity <= 0) {
      throw new Error("Price and quantity must be positive.");
    }

    const orderResult = await this.withTransaction(async (client) => {
      await this.ensureUserAccounts(client, userId);

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

      await this.reserveForOrderTx(client, userId, side, symbol, order.price, order.quantity, order.id);
      await client.query(
        `
          INSERT INTO orders (id, user_id, symbol, side, type, price, quantity, remaining_quantity, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          order.id,
          order.userId,
          order.symbol,
          order.side,
          order.type,
          order.price,
          order.quantity,
          order.remainingQuantity,
          order.status,
          order.createdAt,
          order.updatedAt
        ]
      );

      while (order.remainingQuantity > 0) {
        const bestMatch = await this.getBestMatchTx(client, symbol, side, order.price);
        if (!bestMatch || bestMatch.id === order.id) {
          break;
        }

        const tradedQuantity = Math.min(order.remainingQuantity, bestMatch.remainingQuantity);
        const tradedPrice = bestMatch.price;
        await this.settleTradeTx(client, order, bestMatch, tradedQuantity, tradedPrice);
      }

      if (order.remainingQuantity === 0) {
        order.status = "filled";
      } else if (order.remainingQuantity < order.quantity) {
        order.status = "partially_filled";
      }

      order.updatedAt = now();
      await this.updateOrderTx(client, order);
      return order;
    });

    this.emit({ type: "market", symbol });
    this.emit({ type: "private", userId });
    this.emit({ type: "admin" });
    return orderResult;
  }

  async cancelOrder(userId: string, orderId: string): Promise<Order> {
    const cancelledOrder = await this.withTransaction(async (client) => {
      const result = await client.query("SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE", [orderId, userId]);
      if (!result.rowCount) {
        throw new Error("Order not found.");
      }

      const order = mapOrder(result.rows[0] as Record<string, unknown>);
      if (order.status === "filled" || order.status === "cancelled") {
        throw new Error("Order is not cancelable.");
      }

      await this.releaseOrderFundsTx(client, order, `Cancel order ${order.id}`);
      order.status = "cancelled";
      order.updatedAt = now();
      await this.updateOrderTx(client, order);
      return order;
    });

    this.emit({ type: "market", symbol: cancelledOrder.symbol });
    this.emit({ type: "private", userId });
    this.emit({ type: "admin" });
    return cancelledOrder;
  }

  async createDeposit(userId: string, asset: Asset, amount: number): Promise<Deposit> {
    if (amount <= 0) {
      throw new Error("Deposit amount must be positive.");
    }

    const deposit = await this.withTransaction(async (client) => {
      await this.ensureUserAccounts(client, userId);
      const nextDeposit: Deposit = {
        id: id("dep"),
        userId,
        asset,
        amount: round(amount),
        createdAt: now()
      };

      await client.query(
        "INSERT INTO deposits (id, user_id, asset, amount, created_at) VALUES ($1, $2, $3, $4, $5)",
        [nextDeposit.id, nextDeposit.userId, nextDeposit.asset, nextDeposit.amount, nextDeposit.createdAt]
      );
      await this.postJournal(client, {
        referenceType: "deposit",
        referenceId: nextDeposit.id,
        description: `Deposit ${asset}`,
        transfers: [
          {
            asset,
            fromAccountKey: externalAccountKey(asset),
            toAccountKey: accountKey(userId, asset, "available"),
            amount: nextDeposit.amount
          }
        ]
      });

      return nextDeposit;
    });

    this.emit({ type: "private", userId });
    this.emit({ type: "admin" });
    return deposit;
  }

  async requestWithdrawal(userId: string, asset: Asset, amount: number, address: string): Promise<Withdrawal> {
    if (amount <= 0) {
      throw new Error("Withdrawal amount must be positive.");
    }

    const withdrawal = await this.withTransaction(async (client) => {
      await this.ensureUserAccounts(client, userId);

      const nextWithdrawal: Withdrawal = {
        id: id("wd"),
        userId,
        asset,
        amount: round(amount),
        address,
        status: "pending",
        createdAt: now()
      };

      await client.query(
        `
          INSERT INTO withdrawals (id, user_id, asset, amount, address, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [nextWithdrawal.id, nextWithdrawal.userId, nextWithdrawal.asset, nextWithdrawal.amount, nextWithdrawal.address, nextWithdrawal.status, nextWithdrawal.createdAt]
      );

      await this.postJournal(client, {
        referenceType: "withdrawal_request",
        referenceId: nextWithdrawal.id,
        description: `Freeze ${asset} for withdrawal review`,
        transfers: [
          {
            asset,
            fromAccountKey: accountKey(userId, asset, "available"),
            toAccountKey: accountKey(userId, asset, "locked"),
            amount: nextWithdrawal.amount
          }
        ]
      });

      return nextWithdrawal;
    });

    this.emit({ type: "private", userId });
    this.emit({ type: "admin" });
    return withdrawal;
  }

  async listOrdersForUser(userId: string): Promise<Order[]> {
    const result = await this.pool.query(
      "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows.map((row) => mapOrder(row as Record<string, unknown>));
  }

  async adminOverview(): Promise<AdminOverview> {
    const [users, openOrders, trades, pendingWithdrawals, dailyVolume] = await Promise.all([
      this.pool.query("SELECT COUNT(*) AS value FROM users"),
      this.pool.query("SELECT COUNT(*) AS value FROM orders WHERE status IN ('open', 'partially_filled')"),
      this.pool.query("SELECT COUNT(*) AS value FROM trades"),
      this.pool.query("SELECT COUNT(*) AS value FROM withdrawals WHERE status = 'pending'"),
      this.pool.query(
        `
          SELECT COALESCE(SUM(price * quantity), 0) AS value
          FROM trades
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        `
      )
    ]);

    return {
      users: Number(users.rows[0].value),
      openOrders: Number(openOrders.rows[0].value),
      trades: Number(trades.rows[0].value),
      pendingWithdrawals: Number(pendingWithdrawals.rows[0].value),
      dailyVolumeUsd: round(asNumber(dailyVolume.rows[0].value), 2)
    };
  }

  async adminUsers(): Promise<User[]> {
    const result = await this.pool.query("SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC");
    return result.rows.map((row) =>
      sanitizeUser(row as { id: string; email: string; name: string; role: UserRole; created_at: string })
    );
  }

  async adminWithdrawals(): Promise<Withdrawal[]> {
    const result = await this.pool.query("SELECT * FROM withdrawals ORDER BY created_at DESC");
    return result.rows.map((row) => mapWithdrawal(row as Record<string, unknown>));
  }

  async reviewWithdrawal(adminUserId: string, withdrawalId: string, action: "approve" | "reject"): Promise<Withdrawal> {
    const reviewed = await this.withTransaction(async (client) => {
      const reviewer = await this.getStoredUser(client, adminUserId);
      if (reviewer.role !== "admin") {
        throw new Error("Only admins can review withdrawals.");
      }

      const result = await client.query("SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE", [withdrawalId]);
      if (!result.rowCount) {
        throw new Error("Withdrawal not found.");
      }

      const withdrawal = mapWithdrawal(result.rows[0] as Record<string, unknown>);
      if (withdrawal.status !== "pending") {
        throw new Error("Withdrawal has already been reviewed.");
      }

      if (action === "reject") {
        await this.postJournal(client, {
          referenceType: "withdrawal_reject",
          referenceId: withdrawal.id,
          description: `Release ${withdrawal.asset} after rejection`,
          transfers: [
            {
              asset: withdrawal.asset,
              fromAccountKey: accountKey(withdrawal.userId, withdrawal.asset, "locked"),
              toAccountKey: accountKey(withdrawal.userId, withdrawal.asset, "available"),
              amount: withdrawal.amount
            }
          ]
        });
        withdrawal.status = "rejected";
      } else {
        await this.postJournal(client, {
          referenceType: "withdrawal_approve",
          referenceId: withdrawal.id,
          description: `Settle ${withdrawal.asset} withdrawal`,
          transfers: [
            {
              asset: withdrawal.asset,
              fromAccountKey: accountKey(withdrawal.userId, withdrawal.asset, "locked"),
              toAccountKey: externalAccountKey(withdrawal.asset),
              amount: withdrawal.amount
            }
          ]
        });
        withdrawal.status = "approved";
      }

      withdrawal.reviewedAt = now();
      withdrawal.reviewerId = adminUserId;

      await client.query(
        `
          UPDATE withdrawals
          SET status = $2,
              reviewed_at = $3,
              reviewer_id = $4
          WHERE id = $1
        `,
        [withdrawal.id, withdrawal.status, withdrawal.reviewedAt, withdrawal.reviewerId]
      );

      return withdrawal;
    });

    this.emit({ type: "private", userId: reviewed.userId });
    this.emit({ type: "admin" });
    return reviewed;
  }
}
