import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { connectToDatabase, disconnectFromDatabase } from "../src/db/connection.js";

let replSet: MongoMemoryReplSet;
const app = createApp();

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectToDatabase(replSet.getUri("crm_test"));
});

afterAll(async () => {
  await disconnectFromDatabase();
  await replSet?.stop();
});

describe("GET /api/health", () => {
  it("returns 200 when the database is reachable", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "up" });
  });

  it("returns a request ID header", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("error responses", () => {
  it("returns 404 ROUTE_NOT_FOUND for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("returns 400 INVALID_JSON for a malformed body", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON" },
    });
  });
});
