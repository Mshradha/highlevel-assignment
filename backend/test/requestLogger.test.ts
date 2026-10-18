import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestLogger } from "../src/shared/middleware/requestLogger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function appWithLogging(enabled: boolean) {
  const app = express();
  app.use(requestLogger({ enabled }));
  const router = express.Router();
  router.get("/", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/contacts", router); // mounted router: req.path would be "/"
  return app;
}

describe("requestLogger", () => {
  it("logs one JSON line per request with the full path, status, and request ID", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await request(appWithLogging(true)).get("/api/contacts");

    const entry = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(entry).toMatchObject({
      level: "info",
      message: "request",
      method: "GET",
      path: "/api/contacts",
      status: 200,
      requestId: res.headers["x-request-id"],
    });
    expect(entry.durationMs).toBeTypeOf("number");
  });

  it("never logs the query string, which can contain emails and phone numbers", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await request(appWithLogging(true)).get("/api/contacts?q=ann.lee%40example.com");

    const line = String(log.mock.calls[0]?.[0]);
    expect(line).not.toContain("ann.lee");
    expect(JSON.parse(line).path).toBe("/api/contacts");
  });

  it("still sets X-Request-Id when logging is off (as in tests)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await request(appWithLogging(false)).get("/api/contacts");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(log).not.toHaveBeenCalled();
  });
});
