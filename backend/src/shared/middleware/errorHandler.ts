import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, "ROUTE_NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

/** Errors raised by express.json(); they carry a `type` string and an HTTP status. */
function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "type" in err && typeof err.type === "string") {
    return err.type;
  }
  return undefined;
}

/**
 * Converts every error into `{ error: { code, message, details? } }`.
 * Unexpected errors are logged with the request ID and returned as a generic 500,
 * so internal details never reach the client.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  const parserErrorType = bodyParserErrorType(err);
  if (parserErrorType === "entity.parse.failed") {
    res
      .status(400)
      .json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
    return;
  }
  if (parserErrorType === "entity.too.large") {
    res
      .status(413)
      .json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } });
    return;
  }

  logger.error("unhandled error", {
    requestId: res.locals.requestId,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
