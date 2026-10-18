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
  const contact = await ContactModel.create(buildContactDocument({ firstName: "Ann", tags }));
  return contact._id.toHexString();
}

const addTag = (id: string, tag: unknown) =>
  request(app).post(`/api/contacts/${id}/tags`).send({ tag });
const removeTag = (id: string, tag: string) =>
  request(app).delete(`/api/contacts/${id}/tags/${encodeURIComponent(tag)}`);
const stored = (id: string) => ContactModel.findById(id).lean();
const activities = (id: string) => ActivityModel.find({ contactId: id }).sort({ _id: 1 }).lean();

describe("POST /api/contacts/:id/tags", () => {
  it("adds a normalized tag, records TAG_ADDED, and returns changed: true", async () => {
    const id = await createContact(["lead"]);
    const before = await stored(id);

    const res = await addTag(id, "  VIP  Customer ");

    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(true);
    expect(res.body.contact.tags).toEqual(["lead", "vip customer"]);
    const after = await stored(id);
    expect(after?.tags).toEqual(["lead", "vip customer"]);
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
    expect(await activities(id)).toMatchObject([
      { type: "TAG_ADDED", details: { tag: "vip customer" } },
    ]);
  });

  it("is a no-op for a tag the contact already has (any case): changed: false, no activity", async () => {
    const id = await createContact(["vip"]);
    const before = await stored(id);

    const res = await addTag(id, "VIP");

    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(false);
    expect((await stored(id))?.tags).toEqual(["vip"]);
    expect((await stored(id))?.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
    expect(await activities(id)).toHaveLength(0);
  });

  it("adds the tag once and records one activity when the same tag is added concurrently", async () => {
    const id = await createContact();
    const results = await Promise.all(Array.from({ length: 5 }, () => addTag(id, "vip")));

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(results.filter((r) => r.body.changed)).toHaveLength(1);
    expect((await stored(id))?.tags).toEqual(["vip"]);
    expect(await activities(id)).toHaveLength(1);
  });

  it("keeps every tag when different tags are added concurrently (no lost updates)", async () => {
    const id = await createContact();
    const tags = ["a1", "b2", "c3", "d4", "e5"];
    await Promise.all(tags.map((t) => addTag(id, t)));

    expect((await stored(id))?.tags.sort()).toEqual(tags);
    expect(await activities(id)).toHaveLength(5);
  });

  it("returns 422 TAG_LIMIT_EXCEEDED for a new tag on a contact with 50 tags", async () => {
    const id = await createContact(Array.from({ length: 50 }, (_, i) => `t${i}`));
    const res = await addTag(id, "one-more");

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("TAG_LIMIT_EXCEEDED");
    expect((await stored(id))?.tags).toHaveLength(50);
  });

  it("still treats an existing tag on a full contact as a no-op, not a limit error", async () => {
    const id = await createContact(Array.from({ length: 50 }, (_, i) => `t${i}`));
    const res = await addTag(id, "t7");
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(false);
  });

  it("does not change the version, so an open edit form can still save", async () => {
    const id = await createContact();
    await addTag(id, "vip");
    expect((await stored(id))?.version).toBe(1);

    // The user loaded version 1 before tagging; their profile edit still succeeds (ADR-007).
    const save = await request(app)
      .patch(`/api/contacts/${id}`)
      .send({ version: 1, company: "Acme" });
    expect(save.status).toBe(200);
    expect(save.body.tags).toEqual(["vip"]);
  });

  it("rolls back the tag if recording the activity fails", async () => {
    const id = await createContact();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(activityRepository, "insert").mockRejectedValueOnce(
      new Error("activity write failed"),
    );

    expect((await addTag(id, "vip")).status).toBe(500);
    expect((await stored(id))?.tags).toEqual([]);
  });

  it("returns 404 for a missing contact and 400 for a malformed id", async () => {
    expect((await addTag(new Types.ObjectId().toHexString(), "vip")).status).toBe(404);
    expect((await addTag("nope", "vip")).body.error.code).toBe("INVALID_ID");
  });

  it.each([
    ["an empty tag", ""],
    ["a whitespace-only tag", "   "],
    ["a tag over 40 characters", "x".repeat(41)],
    ["disallowed characters", "<script>"],
    ["a non-string", 42],
    ["a missing tag", undefined],
  ])("rejects %s with 400", async (_label, tag) => {
    const id = await createContact();
    const res = await addTag(id, tag);
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toHaveProperty("tag");
  });

  it("rejects unknown body fields", async () => {
    const id = await createContact();
    const res = await request(app)
      .post(`/api/contacts/${id}/tags`)
      .send({ tag: "vip", color: "red" });
    expect(res.body.error.details.fields).toEqual({ color: ["Unknown field"] });
  });
});

describe("DELETE /api/contacts/:id/tags/:tag", () => {
  it("removes a present tag, records TAG_REMOVED, and returns changed: true", async () => {
    const id = await createContact(["vip", "lead"]);
    const res = await removeTag(id, "vip");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ changed: true, contact: { tags: ["lead"] } });
    expect(await activities(id)).toMatchObject([{ type: "TAG_REMOVED", details: { tag: "vip" } }]);
  });

  it("normalizes the tag in the URL (case and encoded spaces)", async () => {
    const id = await createContact(["churn risk"]);
    const res = await removeTag(id, "Churn Risk");
    expect(res.body.changed).toBe(true);
    expect((await stored(id))?.tags).toEqual([]);
  });

  it("is a no-op for a tag the contact doesn't have: changed: false, no activity", async () => {
    const id = await createContact(["lead"]);
    const res = await removeTag(id, "vip");

    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(false);
    expect(await activities(id)).toHaveLength(0);
  });

  it("removes once and records one activity when the same tag is removed concurrently", async () => {
    const id = await createContact(["vip"]);
    const results = await Promise.all(Array.from({ length: 5 }, () => removeTag(id, "vip")));

    expect(results.filter((r) => r.body.changed)).toHaveLength(1);
    expect(await activities(id)).toHaveLength(1);
  });

  it("returns 404 for a missing contact and 400 for an invalid tag", async () => {
    expect((await removeTag(new Types.ObjectId().toHexString(), "vip")).status).toBe(404);
    const id = await createContact();
    expect((await removeTag(id, "<b>")).status).toBe(400);
  });
});
