import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { errorHandler } from "../src/shared/middleware/errorHandler.js";
import { idParamsSchema, objectIdSchema } from "../src/shared/validation/schemas.js";
import { validated } from "../src/shared/validation/validated.js";

const VALID_ID = "6ad4b0d1bfcfc606379380c0";

// A throwaway app per test: exercises the wrapper without any real endpoints.
function appWith(handler: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.post("/items/:id", handler);
  app.get("/items", handler);
  app.use(errorHandler);
  return app;
}

const bodySchema = z.strictObject({ name: z.string().min(1), email: z.email().optional() });
const querySchema = z.object({ limit: z.coerce.number().int().max(100).default(20) });

describe("validated()", () => {
  it("passes parsed, typed values to the handler", async () => {
    const app = appWith(
      validated({ query: querySchema }, ({ query }, _req, res) => {
        res.json({ limit: query.limit, type: typeof query.limit });
      }),
    );
    const res = await request(app).get("/items?limit=50");
    expect(res.body).toEqual({ limit: 50, type: "number" }); // "50" was coerced
  });

  it("applies schema defaults", async () => {
    const app = appWith(
      validated({ query: querySchema }, ({ query }, _req, res) => {
        res.json(query);
      }),
    );
    expect((await request(app).get("/items")).body).toEqual({ limit: 20 });
  });

  it("reports body errors by field name and query errors with a prefix", async () => {
    const handler = vi.fn();
    const app = appWith(
      validated({ params: idParamsSchema, query: querySchema, body: bodySchema }, handler),
    );
    const res = await request(app)
      .post(`/items/${VALID_ID}?limit=500`)
      .send({ name: "", email: "nope" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual([
      "email",
      "name",
      "query.limit",
    ]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("reports each unknown body field separately", async () => {
    const app = appWith(validated({ body: bodySchema }, vi.fn()));
    const res = await request(app)
      .post(`/items/${VALID_ID}`)
      .send({ name: "A", role: "x", isAdmin: true });
    expect(res.body.error.details.fields).toEqual({
      role: ["Unknown field"],
      isAdmin: ["Unknown field"],
    });
  });

  it("rejects a missing body when one is required", async () => {
    const app = appWith(validated({ body: bodySchema }, vi.fn()));
    const res = await request(app).post(`/items/${VALID_ID}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toHaveProperty("body");
  });

  it("returns INVALID_ID for a malformed :id, even when other input is also wrong", async () => {
    const app = appWith(validated({ params: idParamsSchema, body: bodySchema }, vi.fn()));
    const res = await request(app).post("/items/not-an-id").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: "INVALID_ID", message: "The id in the URL is not a valid id" },
    });
  });

  it("forwards errors thrown by the handler to the error middleware", async () => {
    const app = appWith(
      validated({}, () => {
        throw new Error("boom");
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await request(app).get("/items")).status).toBe(500);
  });
});

describe("objectIdSchema", () => {
  it("accepts a 24-character hex id", () => {
    expect(objectIdSchema.safeParse(VALID_ID).success).toBe(true);
  });

  // mongoose.isValidObjectId accepts any 12-character string; our schema doesn't.
  it.each(["aaaaaaaaaaaa", "not-an-id", "", "6ad4b0d1bfcfc606379380cZ"])("rejects %j", (value) => {
    expect(objectIdSchema.safeParse(value).success).toBe(false);
  });
});
