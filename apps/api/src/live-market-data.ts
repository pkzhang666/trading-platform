import { execFile } from "node:child_process";
import https from "node:https";
import os from "node:os";
import WebSocket from "ws";
import {
  type FeedConnectionStatus,
  type LiveMarketSnapshot,
  type LiveTrade,
  type MarketSymbol,
  type OrderBookLevel,
  type OrderBookSnapshot,
  type SystemHealth
} from "@trading-platform/common";

type ProductId = "BTC-USD" | "ETH-USD";

interface CoinbaseTickerMessage {
  type: "ticker";
  product_id: ProductId;
  price: string;
  best_bid?: string;
  best_ask?: string;
  last_size?: string;
  side?: "buy" | "sell";
  time?: string;
  volume_24h?: string;
}

interface CoinbaseSnapshotMessage {
  type: "snapshot";
  product_id: ProductId;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

interface CoinbaseL2UpdateMessage {
  type: "l2update";
  product_id: ProductId;
  time?: string;
  changes: Array<["buy" | "sell", string, string]>;
}

interface CoinbaseHeartbeatMessage {
  type: "heartbeat";
  product_id: ProductId;
  time?: string;
}

interface CoinbaseRecentTrade {
  trade_id: number;
  price: string;
  size: string;
  side: "buy" | "sell";
  time: string;
}

interface FeedState {
  symbol: MarketSymbol;
  productId: ProductId;
  status: FeedConnectionStatus;
  source: "coinbase";
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  volume24h: number;
  updatedAt: string;
  connectionMessage?: string;
  bids: Map<number, number>;
  asks: Map<number, number>;
  trades: LiveTrade[];
}

const PRODUCT_MAP: Record<MarketSymbol, ProductId> = {
  "BTC/USD": "BTC-USD",
  "ETH/USD": "ETH-USD"
};

const SYMBOL_MAP: Record<ProductId, MarketSymbol> = {
  "BTC-USD": "BTC/USD",
  "ETH-USD": "ETH/USD"
};

function now(): string {
  return new Date().toISOString();
}

function round(value: number, digits = 8): number {
  return Number(value.toFixed(digits));
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function httpsJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        family: 4,
        headers: {
          "User-Agent": "trading-platform/0.1"
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`HTTP ${response.statusCode}: ${body}`));
            return;
          }

          resolve(JSON.parse(body) as T);
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(10000, () => {
      request.destroy(new Error("HTTPS request timed out."));
    });
  });
}

function powershellJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const command = `Invoke-RestMethod -Uri '${url}' | ConvertTo-Json -Compress`;
    execFile(
      "powershell",
      ["-NoProfile", "-Command", command],
      {
        timeout: 15000,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        try {
          resolve(JSON.parse(stdout.trim()) as T);
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

async function httpJson<T>(url: string): Promise<T> {
  if (os.platform() === "win32") {
    try {
      return await powershellJson<T>(url);
    } catch (error) {
      return httpsJson<T>(url);
    }
  }

  try {
    return await httpsJson<T>(url);
  } catch (error) {
    throw error;
  }
}

export class CoinbaseMarketDataService {
  private readonly restBaseUrl: string;

  private readonly websocketUrl: string;

  private readonly reconnectTimers = new Map<MarketSymbol, NodeJS.Timeout>();

  private readonly sockets = new Map<MarketSymbol, WebSocket>();

  private readonly pollTimers = new Map<MarketSymbol, NodeJS.Timeout>();

  private readonly listeners = new Set<(symbol: MarketSymbol) => void>();

  private readonly reconnectAttempt = new Map<MarketSymbol, number>();

  private readonly states = new Map<MarketSymbol, FeedState>();

  private readonly staleCheckTimer: NodeJS.Timeout;

  constructor(
    private readonly symbols: MarketSymbol[] = ["BTC/USD", "ETH/USD"],
    options?: {
      restBaseUrl?: string;
      websocketUrl?: string;
    }
  ) {
    this.restBaseUrl = options?.restBaseUrl ?? process.env.COINBASE_REST_URL ?? "https://api.exchange.coinbase.com";
    this.websocketUrl = options?.websocketUrl ?? process.env.COINBASE_WS_URL ?? "wss://ws-feed.exchange.coinbase.com";

    for (const symbol of symbols) {
      this.states.set(symbol, {
        symbol,
        productId: PRODUCT_MAP[symbol],
        status: "connecting",
        source: "coinbase",
        lastPrice: 0,
        bestBid: 0,
        bestAsk: 0,
        volume24h: 0,
        updatedAt: now(),
        bids: new Map<number, number>(),
        asks: new Map<number, number>(),
        trades: []
      });
    }

    this.staleCheckTimer = setInterval(() => {
      for (const symbol of this.symbols) {
        const state = this.getState(symbol);
        const ageMs = Date.now() - new Date(state.updatedAt).getTime();
        if (state.status === "connected" && ageMs > 45000) {
          state.status = "degraded";
          state.connectionMessage = "Feed appears stale. Awaiting new Coinbase updates.";
          this.emit(symbol);
        }
      }
    }, 15000);

    this.staleCheckTimer.unref();
  }

  async start(): Promise<void> {
    await Promise.all(this.symbols.map((symbol) => this.refreshMarket(symbol)));
    this.symbols.forEach((symbol) => {
      this.connect(symbol);
      this.startPolling(symbol);
    });
  }

  subscribe(listener: (symbol: MarketSymbol) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(symbol: MarketSymbol): void {
    this.listeners.forEach((listener) => listener(symbol));
  }

  private getState(symbol: MarketSymbol): FeedState {
    const state = this.states.get(symbol);
    if (!state) {
      throw new Error(`Unknown live market symbol: ${symbol}`);
    }

    return state;
  }

  private updateStatus(symbol: MarketSymbol, status: FeedConnectionStatus, connectionMessage?: string): void {
    const state = this.getState(symbol);
    state.status = status;
    state.connectionMessage = connectionMessage;
    state.updatedAt = now();
    this.emit(symbol);
  }

  private async refreshMarket(symbol: MarketSymbol): Promise<void> {
    const productId = PRODUCT_MAP[symbol];

    try {
      const [tickerResult, bookResult, statsResult, recentTradesResult] = await Promise.allSettled([
        httpJson<{
          price?: string;
          bid?: string;
          ask?: string;
          volume?: string;
        }>(`${this.restBaseUrl}/products/${productId}/ticker`),
        httpJson<{
          bids?: Array<[string, string, number?]>;
          asks?: Array<[string, string, number?]>;
          time?: string;
        }>(`${this.restBaseUrl}/products/${productId}/book?level=2`),
        httpJson<{
          volume?: string;
        }>(`${this.restBaseUrl}/products/${productId}/stats`),
        httpJson<Array<CoinbaseRecentTrade> | { value?: CoinbaseRecentTrade[] }>(
          `${this.restBaseUrl}/products/${productId}/trades?limit=20`
        )
      ]);

      if (tickerResult.status !== "fulfilled") {
        throw tickerResult.reason;
      }

      const ticker = tickerResult.value;
      const stats = statsResult.status === "fulfilled" ? statsResult.value : { volume: ticker.volume };
      const book =
        bookResult.status === "fulfilled"
          ? bookResult.value
          : {
              bids: ticker.bid ? [[ticker.bid, "1"]] : [],
              asks: ticker.ask ? [[ticker.ask, "1"]] : [],
              time: now()
            };

      const state = this.getState(symbol);
      state.lastPrice = toNumber(ticker.price);
      state.bestBid = toNumber(ticker.bid);
      state.bestAsk = toNumber(ticker.ask);
      state.volume24h = toNumber(stats.volume) || toNumber(ticker.volume);
      state.updatedAt = book.time ?? now();
      state.connectionMessage = "Refreshing from Coinbase REST market data.";
      state.status = "connected";
      state.bids = new Map(
        (book.bids ?? []).slice(0, 20).map(([price, size]) => [toNumber(price), toNumber(size)])
      );
      state.asks = new Map(
        (book.asks ?? []).slice(0, 20).map(([price, size]) => [toNumber(price), toNumber(size)])
      );
      if (recentTradesResult.status === "fulfilled") {
        const rawTrades = Array.isArray(recentTradesResult.value)
          ? recentTradesResult.value
          : recentTradesResult.value.value ?? [];

        state.trades = rawTrades.map((trade) => ({
          id: `${productId}-${trade.trade_id}`,
          symbol,
          price: toNumber(trade.price),
          quantity: toNumber(trade.size),
          side: trade.side,
          source: "coinbase",
          createdAt: trade.time
        }));
      }
      this.emit(symbol);
    } catch (error) {
      this.updateStatus(symbol, "degraded", error instanceof Error ? error.message : "Coinbase REST refresh failed.");
    }
  }

  private startPolling(symbol: MarketSymbol): void {
    const timer = setInterval(() => {
      void this.refreshMarket(symbol);
    }, 3000);

    timer.unref();
    this.pollTimers.set(symbol, timer);
  }

  private connect(symbol: MarketSymbol): void {
    this.clearReconnect(symbol);
    const state = this.getState(symbol);
    if (state.lastPrice > 0) {
      state.connectionMessage = "REST market data online. Attempting websocket acceleration.";
      this.emit(symbol);
    } else {
      this.updateStatus(symbol, "connecting", "Connecting to Coinbase Exchange websocket feed.");
    }

    const socket = new WebSocket(this.websocketUrl);
    this.sockets.set(symbol, socket);

    socket.on("open", () => {
      this.reconnectAttempt.set(symbol, 0);
      socket.send(
        JSON.stringify({
          type: "subscribe",
          product_ids: [PRODUCT_MAP[symbol]],
          channels: ["heartbeat", "ticker", "level2"]
        })
      );
      this.updateStatus(symbol, "connected", "Receiving Coinbase live feed.");
    });

    socket.on("message", (raw) => {
      try {
        this.handleMessage(symbol, JSON.parse(String(raw)) as Record<string, unknown>);
      } catch (error) {
        this.updateStatus(symbol, "degraded", error instanceof Error ? error.message : "Message parse failed.");
      }
    });

    socket.on("close", () => {
      const state = this.getState(symbol);
      if (state.lastPrice > 0) {
        state.connectionMessage = "REST market data online. Websocket closed, polling remains active.";
        state.status = "connected";
        this.emit(symbol);
      } else {
        this.updateStatus(symbol, "disconnected", "Coinbase websocket closed. Reconnecting.");
      }
      this.scheduleReconnect(symbol);
    });

    socket.on("error", (error) => {
      const state = this.getState(symbol);
      if (state.lastPrice > 0) {
        state.connectionMessage = `REST market data online. Websocket unavailable: ${error.message}`;
        state.status = "connected";
        this.emit(symbol);
        return;
      }

      this.updateStatus(symbol, "degraded", error.message);
    });
  }

  private scheduleReconnect(symbol: MarketSymbol): void {
    this.clearReconnect(symbol);
    const attempt = (this.reconnectAttempt.get(symbol) ?? 0) + 1;
    this.reconnectAttempt.set(symbol, attempt);
    const delayMs = Math.min(1000 * 2 ** Math.min(attempt, 5), 30000);
    const timer = setTimeout(() => this.connect(symbol), delayMs);
    this.reconnectTimers.set(symbol, timer);
  }

  private clearReconnect(symbol: MarketSymbol): void {
    const timer = this.reconnectTimers.get(symbol);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(symbol);
    }
  }

  private handleMessage(symbol: MarketSymbol, message: Record<string, unknown>): void {
    switch (message.type) {
      case "snapshot":
        this.applySnapshot(symbol, message as unknown as CoinbaseSnapshotMessage);
        break;
      case "l2update":
        this.applyOrderBookUpdate(symbol, message as unknown as CoinbaseL2UpdateMessage);
        break;
      case "ticker":
        this.applyTicker(symbol, message as unknown as CoinbaseTickerMessage);
        break;
      case "heartbeat":
        this.applyHeartbeat(symbol, message as unknown as CoinbaseHeartbeatMessage);
        break;
      default:
        break;
    }
  }

  private applySnapshot(symbol: MarketSymbol, message: CoinbaseSnapshotMessage): void {
    const state = this.getState(symbol);
    state.bids.clear();
    state.asks.clear();

    message.bids.forEach(([price, size]) => state.bids.set(toNumber(price), toNumber(size)));
    message.asks.forEach(([price, size]) => state.asks.set(toNumber(price), toNumber(size)));
    state.updatedAt = now();
    this.emit(symbol);
  }

  private applyOrderBookUpdate(symbol: MarketSymbol, message: CoinbaseL2UpdateMessage): void {
    const state = this.getState(symbol);

    message.changes.forEach(([side, priceValue, sizeValue]) => {
      const price = toNumber(priceValue);
      const size = toNumber(sizeValue);
      const book = side === "buy" ? state.bids : state.asks;

      if (size === 0) {
        book.delete(price);
        return;
      }

      book.set(price, size);
    });

    state.updatedAt = message.time ?? now();
    this.emit(symbol);
  }

  private applyTicker(symbol: MarketSymbol, message: CoinbaseTickerMessage): void {
    const state = this.getState(symbol);
    state.lastPrice = toNumber(message.price);
    state.bestBid = toNumber(message.best_bid) || state.bestBid;
    state.bestAsk = toNumber(message.best_ask) || state.bestAsk;
    state.volume24h = toNumber(message.volume_24h) || state.volume24h;
    state.updatedAt = message.time ?? now();
    state.status = "connected";
    state.connectionMessage = "Receiving Coinbase live feed.";

    const tradeSize = toNumber(message.last_size);
    if (tradeSize > 0) {
      const trade: LiveTrade = {
        id: `${message.product_id}-${state.updatedAt}-${message.price}-${message.last_size}`,
        symbol,
        price: state.lastPrice,
        quantity: tradeSize,
        side: message.side ?? "unknown",
        source: "coinbase",
        createdAt: state.updatedAt
      };

      state.trades = [trade, ...state.trades].slice(0, 30);
    }

    this.emit(symbol);
  }

  private applyHeartbeat(symbol: MarketSymbol, message: CoinbaseHeartbeatMessage): void {
    const state = this.getState(symbol);
    state.updatedAt = message.time ?? now();
    if (state.status !== "connected") {
      state.status = "connected";
      state.connectionMessage = "Heartbeat received from Coinbase live feed.";
      this.emit(symbol);
    }
  }

  private topLevels(side: "buy" | "sell", levels: Map<number, number>): OrderBookLevel[] {
    return [...levels.entries()]
      .map(([price, quantity]) => ({
        price: round(price, 2),
        quantity: round(quantity)
      }))
      .sort((left, right) => (side === "buy" ? right.price - left.price : left.price - right.price))
      .slice(0, 15);
  }

  private snapshotFor(symbol: MarketSymbol): LiveMarketSnapshot {
    const state = this.getState(symbol);
    const orderBook: OrderBookSnapshot = {
      symbol,
      bids: this.topLevels("buy", state.bids),
      asks: this.topLevels("sell", state.asks),
      lastPrice: round(state.lastPrice, 2)
    };

    return {
      symbol,
      source: state.source,
      status: state.status,
      lastPrice: round(state.lastPrice, 2),
      bestBid: round(state.bestBid, 2),
      bestAsk: round(state.bestAsk, 2),
      volume24h: round(state.volume24h, 4),
      updatedAt: state.updatedAt,
      orderBook,
      trades: [...state.trades],
      connectionMessage: state.connectionMessage
    };
  }

  listMarkets(): LiveMarketSnapshot[] {
    return this.symbols.map((symbol) => this.snapshotFor(symbol));
  }

  getMarket(symbol: MarketSymbol): LiveMarketSnapshot {
    return this.snapshotFor(symbol);
  }

  getHealth(): SystemHealth {
    const markets = this.listMarkets();
    return {
      ok: markets.every((market) => market.status === "connected" || market.status === "connecting"),
      services: markets.map((market) => ({
        name: `coinbase:${market.symbol}`,
        ok: market.status === "connected" || market.status === "connecting",
        details: market.connectionMessage,
        updatedAt: market.updatedAt
      }))
    };
  }
}
