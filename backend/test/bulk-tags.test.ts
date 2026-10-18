import { Types } from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ActivityModel } from "../src/modules/activities/activity.model.js";
import { activityRepository } from "../src/modules/activities/activity.repository.js";
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
afterEach(() => {
  vi.restoreAllMocks();
});

async function createContact(tags: string[] = []) {
  const contact = await ContactModel.create(buildContactDocument({ firstName: "C", tags }));
  return contact._id.toHexString();
}
const fullTags = () => Array.from({ length: 50 }, (_, i) => `t${i}`);
const missingId = () => new Types.ObjectId().toHexString();
const bulk = (body: object) => request(app).post("/api/contacts/bulk-tags").send(body);
const tagsOf = async (id: string) => (await ContactModel.findById(id).lean())?.tags;

describe("POST /api/contacts/bulk-tags", () => {
  it("tags eligible contacts and reports the rest without failing", async () => {
    const eligible = [await createContact(), await createContact(["lead"]), await createContact()];
    const already = await createContact(["vip"]);
    const full = await createContact(fullTags());
    const missing = [missingId(), missingId()];

    const res = await bulk({ contactIds: [...eligible, already, full, ...missing], tag: " VIP " });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      tag: "vip",
      requested: 7,
      modified: 3,
      alreadyTagged: 1,
      skippedTagLimit: 1,
      notFound: missing,
    });
    for (const id of eligible) expect(await tagsOf(id)).toContain("vip");
    expect(await tagsOf(full)).not.toContain("vip");
  });

  it("records exactly one TAG_ADDED per changed contact, sharing a bulkOperationId", async () => {
    const ids = [await createContact(), await createContact(), await createContact(["vip"])];
    await bulk({ contactIds: ids, tag: "vip" });

    const recorded = await ActivityModel.find().lean();
    expect(recorded).toHaveLength(2);
    expect(new Set(recorded.map((a) => a.contactId.toHexString()))).toEqual(
      new Set(ids.slice(0, 2)),
    );
    const operationIds = new Set(recorded.map((a) => a.details?.bulkOperationId));
    expect(operationIds.size).toBe(1);
    expect([...operationIds][0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("counts a contact selected twice only once", async () => {
    const id = await createContact();
    const res = await bulk({ contactIds: [id, id, id.toUpperCase()], tag: "vip" });

    expect(res.body).toMatchObject({ requested: 1, modified: 1 });
    expect(await ActivityModel.countDocuments()).toBe(1);
  });

  it("is safe to retry: a second identical request changes nothing", async () => {
    const ids = [await createContact(), await createContact()];
    await bulk({ contactIds: ids, tag: "vip" });
    const again = await bulk({ contactIds: ids, tag: "vip" });

    expect(again.body).toMatchObject({ modified: 0, alreadyTagged: 2 });
    expect(await ActivityModel.countDocuments()).toBe(2);
  });

  it("records one activity per contact when a bulk request races single tag adds", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => createContact()));
    await Promise.all([
      bulk({ contactIds: ids, tag: "vip" }),
      ...ids.map((id) => request(app).post(`/api/contacts/${id}/tags`).send({ tag: "vip" })),
    ]);

    for (const id of ids) expect(await tagsOf(id)).toEqual(["vip"]);
    expect(await ActivityModel.countDocuments({ type: "TAG_ADDED" })).toBe(5);
  });

  it("is all-or-nothing: if recording activities fails, no contact is tagged", async () => {
    const ids = [await createContact(), await createContact()];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(activityRepository, "insertMany").mockRejectedValueOnce(new Error("write failed"));

    expect((await bulk({ contactIds: ids, tag: "vip" })).status).toBe(500);
    for (const id of ids) expect(await tagsOf(id)).toEqual([]);
  });

  it.each([
    ["no contacts", { contactIds: [], tag: "vip" }, "contactIds"],
    [
      "more than 500 contacts",
      { contactIds: Array.from({ length: 501 }, missingId), tag: "vip" },
      "contactIds",
    ],
    [
      "a malformed id",
      { contactIds: ["6ad4b0d1bfcfc606379380c0", "nope"], tag: "vip" },
      "contactIds.1",
    ],
    ["a missing tag", { contactIds: ["6ad4b0d1bfcfc606379380c0"] }, "tag"],
    ["an invalid tag", { contactIds: ["6ad4b0d1bfcfc606379380c0"], tag: "<b>" }, "tag"],
    [
      "contactIds not an array",
      { contactIds: "6ad4b0d1bfcfc606379380c0", tag: "vip" },
      "contactIds",
    ],
  ])("rejects %s with 400", async (_label, body, field) => {
    const res = await bulk(body);
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields)).toContain(field);
  });

  it("accepts exactly 500 contacts", async () => {
    const res = await bulk({ contactIds: Array.from({ length: 500 }, missingId), tag: "vip" });
    expect(res.status).toBe(200);
    expect(res.body.notFound).toHaveLength(500);
  });
});
