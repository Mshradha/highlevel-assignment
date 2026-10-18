import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ActivityModel } from "../src/modules/activities/activity.model.js";
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

async function createContact() {
  const contact = await ContactModel.create(
    buildContactDocument({ firstName: "Ann", company: "Acme" }),
  );
  return contact._id.toHexString();
}
const history = (id: string, query = "") =>
  request(app).get(`/api/contacts/${id}/activities${query}`);

describe("GET /api/contacts/:id/activities", () => {
  it("returns real changes from all three operations, newest first", async () => {
    const id = await createContact();
    await request(app).patch(`/api/contacts/${id}`).send({ version: 1, company: "Globex" });
    await request(app).post(`/api/contacts/${id}/tags`).send({ tag: "vip" });
    await request(app).post(`/api/contacts/${id}/tags`).send({ tag: "vip" }); // no-op
    await request(app).delete(`/api/contacts/${id}/tags/vip`);
    await request(app).delete(`/api/contacts/${id}/tags/vip`); // no-op

    const res = await history(id);

    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { type: string }) => a.type)).toEqual([
      "TAG_REMOVED",
      "TAG_ADDED",
      "CONTACT_UPDATED",
    ]);
    expect(res.body.data[2]).toEqual({
      id: expect.any(String),
      contactId: id,
      type: "CONTACT_UPDATED",
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      details: { changes: [{ field: "company", from: "Acme", to: "Globex" }] },
    });
    expect(res.body.data[0].details).toEqual({ tag: "vip" });
  });

  it("only returns the requested contact's activities", async () => {
    const mine = await createContact();
    const other = await createContact();
    await request(app).post(`/api/contacts/${other}/tags`).send({ tag: "vip" });

    expect((await history(mine)).body.data).toEqual([]);
  });

  it("returns 20 by default and honours limit, keeping the newest", async () => {
    const id = await createContact();
    const contactId = new Types.ObjectId(id);
    // Same createdAt for all: order must still be newest-inserted first (_id tie-breaker).
    const createdAt = new Date("2026-01-01T00:00:00Z");
    await ActivityModel.collection.insertMany(
      Array.from({ length: 25 }, (_, i) => ({
        _id: new Types.ObjectId(),
        contactId,
        type: "TAG_ADDED",
        details: { tag: `t${i}` },
        createdAt,
      })),
    );

    const byDefault = await history(id);
    expect(byDefault.body.data).toHaveLength(20);
    expect(byDefault.body.data[0].details.tag).toBe("t24");

    const five = await history(id, "?limit=5");
    expect(five.body.data.map((a: { details: { tag: string } }) => a.details.tag)).toEqual([
      "t24",
      "t23",
      "t22",
      "t21",
      "t20",
    ]);
  });

  it("returns 404 for a missing contact, 400 for a malformed id or bad limit", async () => {
    expect((await history(new Types.ObjectId().toHexString())).status).toBe(404);
    expect((await history("nope")).body.error.code).toBe("INVALID_ID");
    const id = await createContact();
    expect((await history(id, "?limit=51")).status).toBe(400);
    expect((await history(id, "?limit=0")).status).toBe(400);
  });
});
