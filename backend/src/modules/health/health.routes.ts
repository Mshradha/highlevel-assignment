import { Router } from "express";
import { pingDatabase } from "../../db/connection.js";

export const healthRouter = Router();

// 503 when the database is unreachable, so a load balancer stops routing traffic here.
healthRouter.get("/", async (_req, res) => {
  const dbUp = await pingDatabase();
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down" });
});
