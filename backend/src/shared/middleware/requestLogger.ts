import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "../logger.js";

/**
 * Gives every request an ID (returned in X-Request-Id and attached to error logs)
 * and logs one line when the response finishes.
 *
 * Only the path is logged, never the query string: search terms can contain
 * emails and phone numbers.
 */
export function requestLogger({ enabled }: { enabled: boolean }): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    if (enabled) {
      const start = process.hrtime.bigint();
      res.on("finish", () => {
        logger.info("request", {
          requestId,
          method: req.method,
          // req.path is relative to the mounted router by the time the response finishes;
          // originalUrl is the full path. Strip the query string.
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - start) / 1e6,
        });
      });
    }
    next();
  };
}
