import { TradingPlatform } from "./domain.js";
import { FilePlatformAdapter } from "./file-platform-adapter.js";
import { PostgresTradingPlatform } from "./postgres-platform.js";
import type { PlatformRuntime } from "./platform-runtime.js";
import { resolveSecretValue } from "./secrets.js";

export async function createPlatformRuntime(options: { dataFile: string }): Promise<PlatformRuntime> {
  const databaseUrl = await resolveSecretValue({
    envValue: process.env.DATABASE_URL,
    envSecretName: process.env.DATABASE_URL_SECRET_NAME,
    projectId: process.env.SECRET_MANAGER_PROJECT_ID,
    fallback: ""
  });

  if (!databaseUrl) {
    return new FilePlatformAdapter(new TradingPlatform(options.dataFile));
  }

  const passwordPepper = await resolveSecretValue({
    envValue: process.env.PASSWORD_PEPPER,
    envSecretName: process.env.PASSWORD_PEPPER_SECRET_NAME,
    projectId: process.env.SECRET_MANAGER_PROJECT_ID,
    fallback: "local-dev-pepper"
  });

  const adminPassword = await resolveSecretValue({
    envValue: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    envSecretName: process.env.BOOTSTRAP_ADMIN_PASSWORD_SECRET_NAME,
    projectId: process.env.SECRET_MANAGER_PROJECT_ID,
    fallback: "Admin123!"
  });

  const traderPassword = await resolveSecretValue({
    envValue: process.env.BOOTSTRAP_TRADER_PASSWORD,
    envSecretName: process.env.BOOTSTRAP_TRADER_PASSWORD_SECRET_NAME,
    projectId: process.env.SECRET_MANAGER_PROJECT_ID,
    fallback: "Trader123!"
  });

  return PostgresTradingPlatform.create(databaseUrl, {
    passwordPepper,
    bootstrapUsers: [
      {
        id: "admin-1",
        email: "admin@trade.local",
        name: "Platform Admin",
        role: "admin",
        password: adminPassword,
        balances: [
          { asset: "BTC", available: 10 },
          { asset: "ETH", available: 100 },
          { asset: "USD", available: 500000 }
        ]
      },
      {
        id: "trader-1",
        email: "trader@trade.local",
        name: "Demo Trader",
        role: "trader",
        password: traderPassword,
        balances: [
          { asset: "BTC", available: 2.5 },
          { asset: "ETH", available: 20 },
          { asset: "USD", available: 250000 }
        ]
      }
    ]
  });
}
