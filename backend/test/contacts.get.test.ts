import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ContactModel } from "../src/modules/contacts/contact.model.js";
import { buildContactDocument } from "../src/modules/contacts/contact.normalize.js";
import { clearDatabase, startTestDatabase } from "./helpers/db.js";

const app = createApp();
let db: Awaited<ReturnType<typeof startTestDatabase>>;
beforeAll(async () => {
  db = await startTestDatabase();
});
afterAll(async () => {
  await db.stop();
});
beforeEach(clearDatabase);

describe("GET /api/contacts/:id", () => {
  it("returns the contact as a DTO: nulls for absent fields, no internal fields", async () => {
    const contact = await ContactModel.create(
      buildContactDocument({ firstName: "Ann", email: " Ann@Example.com ", tags: ["VIP"] }),
    );

    const res = await request(app).get(`/api/contacts/${contact._id.toHexString()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: contact._id.toHexString(),
      firstName: "Ann",
      lastName: null,
      email: "ann@example.com",
      phone: null,
      company: null,
      tags: ["vip"],
      version: 1,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    });
  });

  it("returns 404 NOT_FOUND for a well-formed id that doesn't exist", async () => {
    const res = await request(app).get(`/api/contacts/${new Types.ObjectId().toHexString()}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Contact not found" } });
  });

  it.each(["not-an-id", "aaaaaaaaaaaa", "123"])("returns 400 INVALID_ID for %j", async (id) => {
    const res = await request(app).get(`/api/contacts/${id}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ID");
  });
});
