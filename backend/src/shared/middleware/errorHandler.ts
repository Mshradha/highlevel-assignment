import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import { AppError, errors, type FieldErrors } from "../errors.js";
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
 * Translates known library errors into AppErrors. Services are expected to
 * handle these themselves; this is the safety net so nothing known becomes a 500.
 */
function toAppError(err: unknown, requestId: unknown): AppError | undefined {
  if (err instanceof AppError) return err;

  const parserErrorType = bodyParserErrorType(err);
  if (parserErrorType === "entity.parse.failed") {
    return new AppError(400, "INVALID_JSON", "Request body is not valid JSON");
  }
  if (parserErrorType === "entity.too.large") {
    return new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }

  // Unique index violation (MongoDB error 11000). keyPattern says which index.
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
    if (err.keyPattern && "email" in err.keyPattern) return errors.duplicateEmail();
  }

  // A query ran past its maxTimeMS (MongoDB error 50, MaxTimeMSExpired).
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 50) {
    logger.warn("query exceeded its time limit", { requestId });
    return new AppError(503, "QUERY_TIMEOUT", "The search took too long; try narrowing it");
  }

  // A string that isn't an ObjectId reached a query. Zod should catch this first.
  if (err instanceof mongoose.Error.CastError && err.kind === "ObjectId") {
    return errors.invalidId();
  }

  // Input that passed request validation but broke a schema rule. Still the
  // client's input, so 400 — but it means the Zod and Mongoose rules disagree.
  if (err instanceof mongoose.Error.ValidationError) {
    logger.warn("schema validation caught input that request validation allowed", {
      requestId,
      paths: Object.keys(err.errors),
    });
    const fields: FieldErrors = {};
    for (const [path, detail] of Object.entries(err.errors)) fields[path] = [detail.message];
    return errors.validation(fields);
  }

  return undefined;
}

/**
 * Converts every error into `{ error: { code, message, details? } }`.
 * Unexpected errors are logged with the request ID and returned as a generic 500,
 * so internal details never reach the client.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const requestId = res.locals.requestId;
  const appError = toAppError(err, requestId);

  if (appError) {
    res.status(appError.status).json({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details !== undefined && { details: appError.details }),
      },
    });
    return;
  }

  logger.error("unhandled error", {
    requestId,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
