import http from "node:http";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { assets, type Asset, type MarketSymbol } from "@trading-platform/common";
import { createPlatformRuntime } from "./create-platform-runtime.js";
import { CoinbaseMarketDataService } from "./live-market-data.js";

dotenv.config();

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);
const dataFile = process.env.DATA_FILE ?? "./data/demo-exchange.json";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const registerSchema = authSchema.extend({
  name: z.string().min(2)
});

const placeOrderSchema = z.object({
  symbol: z.enum(["BTC/USD", "ETH/USD"]),
  side: z.enum(["buy", "sell"]),
  price: z.number().positive(),
  quantity: z.number().positive()
});

const depositSchema = z.object({
  asset: z.enum(["BTC", "ETH", "USD"]),
  amount: z.number().positive()
});

const withdrawalSchema = depositSchema.extend({
  address: z.string().min(8)
});

function getToken(req: express.Request): string | undefined {
  const header = req.header("authorization");
  if (!header) {
    return undefined;
  }

  return header.replace(/^Bearer\s+/i, "").trim();
}

const app = express();
const liveMarketData = new CoinbaseMarketDataService();
const platform = await createPlatformRuntime({ dataFile });

void liveMarketData.start();
liveMarketData.subscribe((symbol) => {
  const liveMarket = liveMarketData.getMarket(symbol);
  void platform.updateReferencePrice(symbol, liveMarket.lastPrice).catch((error) => {
    console.error("Failed to update reference price", error);
  });
});

app.use(cors());
app.use(express.json());

async function requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction): Promise<void> {
  const token = getToken(req);
  const user = token ? await platform.getUserByToken(token) : undefined;

  if (!user) {
    next(new Error("Unauthorized"));
    return;
  }

  (req as express.Request & { userId: string; role: string }).userId = user.id;
  (req as express.Request & { userId: string; role: string }).role = user.role;
  next();
}

function requireAdmin(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  const role = (req as express.Request & { role?: string }).role;
  if (role !== "admin") {
    next(new Error("Admin access required"));
    return;
  }

  next();
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    marketData: liveMarketData.getHealth()
  });
});

app.get("/ready", (_req, res) => {
  const health = liveMarketData.getHealth();
  const ready = liveMarketData.listMarkets().every((market) => market.lastPrice > 0);
  res.status(ready ? 200 : 503).json({
    ...health,
    ok: ready
  });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    await platform.register(body.email, body.password, body.name);
    res.status(201).json(await platform.login(body.email, body.password));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const body = authSchema.parse(req.body);
    res.json(await platform.login(body.email, body.password));
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await platform.getUserByToken(getToken(req) ?? "");
  res.json(user);
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const userId = (req as express.Request & { userId: string }).userId;
  res.json(await platform.getDashboard(userId));
});

app.get("/api/markets", async (_req, res) => {
  res.json(await platform.listMarkets());
});

app.get("/api/live/markets", (_req, res) => {
  res.json(liveMarketData.listMarkets());
});

app.get("/api/live/markets/:symbol", (req, res) => {
  res.json(liveMarketData.getMarket(String(req.params.symbol) as MarketSymbol));
});

app.get("/api/orderbook/:symbol", async (req, res) => {
  res.json(await platform.getOrderBook(String(req.params.symbol) as MarketSymbol));
});

app.get("/api/trades/:symbol", async (req, res) => {
  res.json(await platform.listRecentTrades(String(req.params.symbol) as MarketSymbol));
});

app.get("/api/live/orderbook/:symbol", (req, res) => {
  res.json(liveMarketData.getMarket(String(req.params.symbol) as MarketSymbol).orderBook);
});

app.get("/api/live/trades/:symbol", (req, res) => {
  res.json(liveMarketData.getMarket(String(req.params.symbol) as MarketSymbol).trades);
});

app.get("/api/system/health", (_req, res) => {
  res.json(liveMarketData.getHealth());
});

app.get("/api/orders", requireAuth, async (req, res) => {
  const userId = (req as express.Request & { userId: string }).userId;
  res.json(await platform.listOrdersForUser(userId));
});

app.post("/api/orders", requireAuth, async (req, res, next) => {
  try {
    const body = placeOrderSchema.parse(req.body);
    const userId = (req as express.Request & { userId: string }).userId;
    res.status(201).json(await platform.placeOrder(userId, body));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as express.Request & { userId: string }).userId;
    res.json(await platform.cancelOrder(userId, String(req.params.id)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/wallet/deposits", requireAuth, async (req, res, next) => {
  try {
    const body = depositSchema.parse(req.body);
    const userId = (req as express.Request & { userId: string }).userId;
    res.status(201).json(await platform.createDeposit(userId, body.asset as Asset, body.amount));
  } catch (error) {
    next(error);
  }
});

app.post("/api/wallet/withdrawals", requireAuth, async (req, res, next) => {
  try {
    const body = withdrawalSchema.parse(req.body);
    const userId = (req as express.Request & { userId: string }).userId;
    res.status(201).json(await platform.requestWithdrawal(userId, body.asset as Asset, body.amount, body.address));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/overview", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await platform.adminOverview());
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await platform.adminUsers());
});

app.get("/api/admin/withdrawals", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await platform.adminWithdrawals());
});

app.post("/api/admin/withdrawals/:id/approve", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const userId = (req as express.Request & { userId: string }).userId;
    res.json(await platform.reviewWithdrawal(userId, String(req.params.id), "approve"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/withdrawals/:id/reject", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const userId = (req as express.Request & { userId: string }).userId;
    res.json(await platform.reviewWithdrawal(userId, String(req.params.id), "reject"));
  } catch (error) {
    next(error);
  }
});

app.get("/api/assets", (_req, res) => {
  res.json(assets);
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = message === "Unauthorized" ? 401 : message === "Admin access required" ? 403 : 400;
  res.status(status).json({ error: message });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket, req) => {
  const url = new URL(req.url ?? "/ws", `http://${req.headers.host ?? "localhost"}`);
  const channel = url.searchParams.get("channel");

  if (channel === "market") {
    const symbol = (url.searchParams.get("symbol") ?? "BTC/USD") as MarketSymbol;
    const sendSnapshot = async (): Promise<void> => {
      socket.send(
        JSON.stringify({
          type: "market.snapshot",
          payload: {
            orderBook: await platform.getOrderBook(symbol),
            trades: await platform.listRecentTrades(symbol)
          }
        })
      );
    };

    void sendSnapshot();
    const unsubscribe = platform.subscribe((event) => {
      if (event.type === "market" && event.symbol === symbol) {
        void sendSnapshot();
      }
    });

    socket.on("close", unsubscribe);
    return;
  }

  if (channel === "live-market") {
    const symbol = (url.searchParams.get("symbol") ?? "BTC/USD") as MarketSymbol;
    const sendSnapshot = (): void => {
      socket.send(
        JSON.stringify({
          type: "live-market.snapshot",
          payload: liveMarketData.getMarket(symbol)
        })
      );
    };

    sendSnapshot();
    const unsubscribe = liveMarketData.subscribe((nextSymbol) => {
      if (nextSymbol === symbol) {
        sendSnapshot();
      }
    });

    socket.on("close", unsubscribe);
    return;
  }

  if (channel === "private") {
    const token = url.searchParams.get("token") ?? "";
    void (async () => {
      const user = await platform.getUserByToken(token);
      if (!user) {
        socket.close();
        return;
      }

      const sendDashboard = async (): Promise<void> => {
        socket.send(
          JSON.stringify({
            type: "private.snapshot",
            payload: await platform.getDashboard(user.id)
          })
        );
      };

      await sendDashboard();
      const unsubscribe = platform.subscribe((event) => {
        if (event.type === "private" && event.userId === user.id) {
          void sendDashboard();
        }
      });

      socket.on("close", unsubscribe);
    })().catch(() => socket.close());
    return;
  }

  if (channel === "admin") {
    const token = url.searchParams.get("token") ?? "";
    void (async () => {
      const user = await platform.getUserByToken(token);
      if (!user || user.role !== "admin") {
        socket.close();
        return;
      }

      const sendOverview = async (): Promise<void> => {
        socket.send(
          JSON.stringify({
            type: "admin.snapshot",
            payload: {
              overview: await platform.adminOverview(),
              withdrawals: await platform.adminWithdrawals()
            }
          })
        );
      };

      await sendOverview();
      const unsubscribe = platform.subscribe((event) => {
        if (event.type === "admin") {
          void sendOverview();
        }
      });

      socket.on("close", unsubscribe);
    })().catch(() => socket.close());
    return;
  }

  socket.close();
});

server.listen(port, host, () => {
  console.log(`Trading platform API listening on http://${host}:${port}`);
});
