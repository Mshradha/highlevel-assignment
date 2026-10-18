import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ActivityModel } from "../src/modules/activities/activity.model.js";
import { clearDatabase, startTestDatabase } from "./helpers/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
beforeAll(async () => {
  db = await startTestDatabase();
});
afterAll(async () => {
  await db.stop();
});
beforeEach(clearDatabase);

describe("activity schema", () => {
  it("stores a CONTACT_UPDATED activity with field changes and createdAt only", async () => {
    const contactId = new Types.ObjectId();
    const activity = await ActivityModel.create({
      contactId,
      type: "CONTACT_UPDATED",
      details: { changes: [{ field: "company", from: null, to: "Acme" }] },
    });
    const stored = await ActivityModel.findById(activity._id).lean();
    expect(stored).toMatchObject({
      contactId,
      type: "CONTACT_UPDATED",
      details: { changes: [{ field: "company", from: null, to: "Acme" }] },
    });
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(stored).not.toHaveProperty("updatedAt"); // append-only
  });

  it("stores a TAG_ADDED activity without an empty changes array", async () => {
    const activity = await ActivityModel.create({
      contactId: new Types.ObjectId(),
      type: "TAG_ADDED",
      details: { tag: "vip" },
    });
    const stored = await ActivityModel.findById(activity._id).lean();
    expect(stored?.details).toEqual({ tag: "vip" });
  });

  it.each([
    ["unknown type", { contactId: new Types.ObjectId(), type: "CONTACT_DELETED" }],
    ["missing contactId", { type: "TAG_ADDED", details: { tag: "vip" } }],
    [
      "change to a non-editable field",
      {
        contactId: new Types.ObjectId(),
        type: "CONTACT_UPDATED",
        details: { changes: [{ field: "version" }] },
      },
    ],
  ])("rejects %s", async (_label, doc) => {
    // Cast: these documents are intentionally invalid; the test checks the schema, not the types.
    await expect(ActivityModel.create(doc as never)).rejects.toThrow(/validation failed/i);
  });

  it("has the per-contact timeline index", async () => {
    const indexes = await ActivityModel.collection.indexes();
    expect(indexes.find((i) => i.name === "contactId_createdAt_id")?.key).toEqual({
      contactId: 1,
      createdAt: -1,
      _id: -1,
    });
  });
});
