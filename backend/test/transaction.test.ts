import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ActivityModel } from "../src/modules/activities/activity.model.js";
import { ContactModel } from "../src/modules/contacts/contact.model.js";
import { buildContactDocument } from "../src/modules/contacts/contact.normalize.js";
import { runInTransaction } from "../src/shared/transaction.js";
import { clearDatabase, startTestDatabase } from "./helpers/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
beforeAll(async () => {
  db = await startTestDatabase();
});
afterAll(async () => {
  await db.stop();
});
beforeEach(clearDatabase);

/** The pattern Phase 6/7 will use: change a contact and record the activity together. */
async function createContactWithActivity(fail: boolean) {
  return runInTransaction(async (session) => {
    const [contact] = await ContactModel.create([buildContactDocument({ firstName: "Ann" })], {
      session,
    });
    await ActivityModel.create(
      [{ contactId: contact!._id, type: "TAG_ADDED", details: { tag: "vip" } }],
      { session },
    );
    if (fail) throw new Error("simulated failure after both writes");
    return contact!._id;
  });
}

describe("runInTransaction", () => {
  it("commits all writes and returns the callback's result", async () => {
    const id = await createContactWithActivity(false);
    expect(await ContactModel.countDocuments({ _id: id })).toBe(1);
    expect(await ActivityModel.countDocuments({ contactId: id })).toBe(1);
  });

  it("rolls back every write when the callback throws, and rethrows the error", async () => {
    await expect(createContactWithActivity(true)).rejects.toThrow("simulated failure");
    expect(await ContactModel.countDocuments()).toBe(0);
    expect(await ActivityModel.countDocuments()).toBe(0);
  });
});
