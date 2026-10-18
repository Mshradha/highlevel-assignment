import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ContactModel } from "../src/modules/contacts/contact.model.js";
import { AppError } from "../src/shared/errors.js";
import { errorHandler } from "../src/shared/middleware/errorHandler.js";
import { requestLogger } from "../src/shared/middleware/requestLogger.js";

/** An app whose only route throws `error`, so we can see how it is reported. */
function appThrowing(error: unknown) {
  const app = express();
  app.use(requestLogger({ enabled: false }));
  app.get("/boom", () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("errorHandler", () => {
  it("returns an AppError's status, code, message, and details", async () => {
    const res = await request(
      appThrowing(new AppError(409, "VERSION_CONFLICT", "Stale", { current: { version: 2 } })),
    ).get("/boom");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: "VERSION_CONFLICT", message: "Stale", details: { current: { version: 2 } } },
    });
  });

  it("maps a duplicate-key error on email to 409 DUPLICATE_EMAIL", async () => {
    const duplicate = new mongoose.mongo.MongoServerError({
      message: "E11000 duplicate key error",
      code: 11000,
      keyPattern: { email: 1 },
    });
    const res = await request(appThrowing(duplicate)).get("/boom");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "DUPLICATE_EMAIL", details: { field: "email" } });
  });

  it("maps an ObjectId cast error to 400 INVALID_ID", async () => {
    const res = await request(
      appThrowing(new mongoose.Error.CastError("ObjectId", "bad", "_id")),
    ).get("/boom");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
  });

  it("maps a Mongoose validation error to 400 with field messages, and warns", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const validationError = await new ContactModel({}).validate().catch((e: unknown) => e);
    expect(validationError).toBeInstanceOf(mongoose.Error.ValidationError);
    const res = await request(appThrowing(validationError)).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.fields).toHaveProperty("firstName");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"level":"warn"'));
  });

  it("hides unexpected errors behind a generic 500 and logs them with the request ID", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(appThrowing(new Error("connection string has password=hunter2"))).get(
      "/boom",
    );

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");

    const logged = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(logged).toMatchObject({ level: "error", requestId: res.headers["x-request-id"] });
    expect(logged.error.message).toContain("hunter2"); // the details stay in server logs
  });
});

describe("errorHandler — limits", () => {
  it("maps a query that ran past maxTimeMS (MongoDB error 50) to 503 QUERY_TIMEOUT", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const timeout = new mongoose.mongo.MongoServerError({
      message: "operation exceeded time limit",
      code: 50,
    });
    const res = await request(appThrowing(timeout)).get("/boom");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("QUERY_TIMEOUT");
  });

  it("rejects a JSON body over 100 kb with 413 PAYLOAD_TOO_LARGE", async () => {
    const app = createApp();
    const res = await request(app)
      .patch("/api/contacts/6ad4b0d1bfcfc606379380c0")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ version: 1, company: "x".repeat(110 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
