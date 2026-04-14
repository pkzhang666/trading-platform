import http from "node:http";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { assets, type Asset, type MarketSymbol } from "@trading-platform/common";
import { TradingPlatform } from "./domain.js";

dotenv.config();

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);
const dataFile = process.env.DATA_FILE ?? "./data/demo-exchange.json";

const app = express();
const platform = new TradingPlatform(dataFile);

app.use(cors());
app.use(express.json());

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const registerSchema = authSchema.extend({
  name: z.string().min(2)
});

const placeOrderSchema = z.object({
  symbol: z.enum(["BTC/USDT", "ETH/USDT"]),
  side: z.enum(["buy", "sell"]),
  price: z.number().positive(),
  quantity: z.number().positive()
});

const depositSchema = z.object({
  asset: z.enum(["BTC", "ETH", "USDT"]),
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

function requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  const token = getToken(req);
  const user = token ? platform.getUserByToken(token) : undefined;

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
  res.json({ ok: true });
});

app.post("/api/auth/register", (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    platform.register(body.email, body.password, body.name);
    res.status(201).json(platform.login(body.email, body.password));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", (req, res, next) => {
  try {
    const body = authSchema.parse(req.body);
    res.json(platform.login(body.email, body.password));
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = platform.getUserByToken(getToken(req) ?? "");
  res.json(user);
});

app.get("/api/dashboard", requireAuth, (req, res) => {
  const userId = (req as express.Request & { userId: string }).userId;
  res.json(platform.getDashboard(userId));
});

app.get("/api/markets", (_req, res) => {
  res.json(platform.listMarkets());
});

app.get("/api/orderbook/:symbol", (req, res) => {
  res.json(platform.getOrderBook(String(req.params.symbol) as MarketSymbol));
});

app.get("/api/trades/:symbol", (req, res) => {
  res.json(platform.listRecentTrades(String(req.params.symbol) as MarketSymbol));
});

app.get("/api/orders", requireAuth, (req, res) => {
  const userId = (req as express.Request & { userId: string }).userId;
  res.json(platform.listOrdersForUser(userId));
});

app.post("/api/orders", requireAuth, (req, res, next) => {
  try {
    const body = placeOrderSchema.parse(req.body);
    const userId = (req as express.Request & { userId: string }).userId;
    res.status(201).json(platform.placeOrder(userId, body));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/orders/:id", requireAuth, (req, res, next) => {
  try {
    const userId = (req as express.Request & { userId: string }).userId;
    res.json(platform.cancelOrder(userId, String(req.params.id)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/wallet/deposits", requireAuth, (req, res, next) => {
  try {
    const body = depositSchema.parse(req.body);
    const userId = (req as express.Request & { userId: string }).userId;
    res.status(201).json(platform.createDeposit(userId, body.asset as Asset, body.amount));
  } catch (error) {
    next(error);
  }
});

app.post("/api/wallet/withdrawals", requireAuth, (req, res, next) => {
  try {
    const body = withdrawalSchema.parse(req.body);
    const userId = (req as express.Request & { userId: string }).userId;
    res.status(201).json(platform.requestWithdrawal(userId, body.asset as Asset, body.amount, body.address));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/overview", requireAuth, requireAdmin, (_req, res) => {
  res.json(platform.adminOverview());
});

app.get("/api/admin/users", requireAuth, requireAdmin, (_req, res) => {
  res.json(platform.adminUsers());
});

app.get("/api/admin/withdrawals", requireAuth, requireAdmin, (_req, res) => {
  res.json(platform.adminWithdrawals());
});

app.post("/api/admin/withdrawals/:id/approve", requireAuth, requireAdmin, (req, res, next) => {
  try {
    const userId = (req as express.Request & { userId: string }).userId;
    res.json(platform.reviewWithdrawal(userId, String(req.params.id), "approve"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/withdrawals/:id/reject", requireAuth, requireAdmin, (req, res, next) => {
  try {
    const userId = (req as express.Request & { userId: string }).userId;
    res.json(platform.reviewWithdrawal(userId, String(req.params.id), "reject"));
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
    const symbol = (url.searchParams.get("symbol") ?? "BTC/USDT") as MarketSymbol;
    const sendSnapshot = (): void => {
      socket.send(
        JSON.stringify({
          type: "market.snapshot",
          payload: {
            orderBook: platform.getOrderBook(symbol),
            trades: platform.listRecentTrades(symbol)
          }
        })
      );
    };

    sendSnapshot();
    const unsubscribe = platform.subscribe((event) => {
      if (event.type === "market" && event.symbol === symbol) {
        sendSnapshot();
      }
    });

    socket.on("close", unsubscribe);
    return;
  }

  if (channel === "private") {
    const token = url.searchParams.get("token") ?? "";
    const user = platform.getUserByToken(token);
    if (!user) {
      socket.close();
      return;
    }

    const sendDashboard = (): void => {
      socket.send(
        JSON.stringify({
          type: "private.snapshot",
          payload: platform.getDashboard(user.id)
        })
      );
    };

    sendDashboard();
    const unsubscribe = platform.subscribe((event) => {
      if (event.type === "private" && event.userId === user.id) {
        sendDashboard();
      }
    });

    socket.on("close", unsubscribe);
    return;
  }

  if (channel === "admin") {
    const token = url.searchParams.get("token") ?? "";
    const user = platform.getUserByToken(token);
    if (!user || user.role !== "admin") {
      socket.close();
      return;
    }

    const sendOverview = (): void => {
      socket.send(
        JSON.stringify({
          type: "admin.snapshot",
          payload: {
            overview: platform.adminOverview(),
            withdrawals: platform.adminWithdrawals()
          }
        })
      );
    };

    sendOverview();
    const unsubscribe = platform.subscribe((event) => {
      if (event.type === "admin") {
        sendOverview();
      }
    });

    socket.on("close", unsubscribe);
    return;
  }

  socket.close();
});

server.listen(port, host, () => {
  console.log(`Trading platform API listening on http://${host}:${port}`);
});
