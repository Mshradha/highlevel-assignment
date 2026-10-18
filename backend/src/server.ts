import { existsSync } from "node:fs";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { connectToDatabase, disconnectFromDatabase } from "./db/connection.js";
import { logger } from "./shared/logger.js";

async function main(): Promise<void> {
  // Node's built-in .env loader; real environment variables still take precedence.
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
  const config = loadConfig();

  await connectToDatabase(config.MONGODB_URI, { autoIndex: config.NODE_ENV !== "production" });
  logger.info("connected to MongoDB");

  const app = createApp({ logRequests: config.NODE_ENV !== "test" });
  const server = app.listen(config.PORT, (error?: Error) => {
    if (error) {
      logger.error("failed to start HTTP server", { error: error.message });
      process.exit(1);
    }
    logger.info("API listening", { port: config.PORT, env: config.NODE_ENV });
  });

  // Stop accepting connections, let in-flight requests finish, then close the DB pool.
  const shutdown = (signal: string) => {
    logger.info("shutting down", { signal });
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      void disconnectFromDatabase().then(() => process.exit(0));
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  logger.error("startup failed", { error: error instanceof Error ? error.message : error });
  process.exit(1);
});
