import express from "express";
import { healthRouter } from "./modules/health/health.routes.js";
import { errorHandler, notFoundHandler } from "./shared/middleware/errorHandler.js";
import { requestLogger } from "./shared/middleware/requestLogger.js";

export interface AppOptions {
  logRequests?: boolean;
}

/**
 * Builds the Express app without starting a server or connecting to MongoDB.
 * Tests pass it straight to Supertest; server.ts adds the database and the port.
 */
export function createApp({ logRequests = false }: AppOptions = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestLogger({ enabled: logRequests }));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
