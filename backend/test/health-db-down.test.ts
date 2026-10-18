import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

// Separate file on purpose: each test file runs in its own worker,
// so this one never has a database connection.
describe("GET /api/health without a database", () => {
  it("returns 503 so load balancers stop sending traffic", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: "down" });
  });
});

describe("security headers", () => {
  it("are set on every API response, including errors", async () => {
    const res = await request(createApp()).get("/api/does-not-exist");
    expect(res.headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
    expect(res.headers).not.toHaveProperty("x-powered-by");
  });
});
