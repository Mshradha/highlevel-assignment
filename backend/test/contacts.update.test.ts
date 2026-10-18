import { Types } from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ActivityModel } from "../src/modules/activities/activity.model.js";
import { activityRepository } from "../src/modules/activities/activity.repository.js";
import { ContactModel } from "../src/modules/contacts/contact.model.js";
import {
  buildContactDocument,
  type ContactInput,
} from "../src/modules/contacts/contact.normalize.js";
import { contactRepository } from "../src/modules/contacts/contact.repository.js";
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

async function createContact(input: Partial<ContactInput> = {}) {
  const contact = await ContactModel.create(
    buildContactDocument({
      firstName: "Ann",
      lastName: "Lee",
      email: "ann@example.com",
      company: "Acme",
      ...input,
    }),
  );
  return contact._id.toHexString();
}

const patch = (id: string, body: object) => request(app).patch(`/api/contacts/${id}`).send(body);
const stored = (id: string) => ContactModel.findById(id).lean();
const activities = (id: string) => ActivityModel.find({ contactId: id }).lean();

describe("PATCH /api/contacts/:id — successful updates", () => {
  it("applies the change, increments the version, and returns the updated contact", async () => {
    const id = await createContact();
    const before = await stored(id);

    const res = await patch(id, { version: 1, company: "Globex" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, company: "Globex", version: 2, firstName: "Ann" });
    const after = await stored(id);
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
    expect(after?.createdAt.getTime()).toBe(before!.createdAt.getTime());
  });

  it("increments the version once per successful update", async () => {
    const id = await createContact();
    for (const [i, company] of ["B", "C", "D"].entries()) {
      expect((await patch(id, { version: i + 1, company })).body.version).toBe(i + 2);
    }
  });

  it("records one CONTACT_UPDATED activity listing only the changed fields", async () => {
    const id = await createContact();
    await patch(id, { version: 1, company: "Globex", lastName: "Lee", email: " ANN@example.com " });

    const recorded = await activities(id);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      type: "CONTACT_UPDATED",
      details: { changes: [{ field: "company", from: "Acme", to: "Globex" }] },
    });
    expect(recorded[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("clears optional fields given null or an empty string", async () => {
    const id = await createContact();
    const res = await patch(id, { version: 1, lastName: null, company: "" });

    expect(res.body).toMatchObject({ lastName: null, company: null, version: 2 });
    const doc = await stored(id);
    expect(doc).not.toHaveProperty("lastName"); // removed, not stored as null
    expect(doc).not.toHaveProperty("lastNameLower");
    expect(doc?.fullNameLower).toBe("ann");
  });

  it("keeps search consistent: the new name is findable, the old one is not", async () => {
    // An email that does not start with "ann", so only the name can match the old search.
    const id = await createContact({ firstName: "Ann", email: "contact1@example.com" });
    await patch(id, { version: 1, firstName: "Zelda" });

    const found = await request(app).get("/api/contacts?q=zel");
    const old = await request(app).get("/api/contacts?q=ann");
    expect(found.body.data.map((c: { id: string }) => c.id)).toEqual([id]);
    expect(old.body.data).toEqual([]);
  });

  it("treats an update with no real change as a no-op: same version, no activity", async () => {
    const id = await createContact();
    const before = await stored(id);

    const res = await patch(id, { version: 1, email: "  ANN@Example.com ", company: "Acme" });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(await activities(id)).toHaveLength(0);
    expect((await stored(id))?.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
  });
});

describe("PATCH /api/contacts/:id — stale versions (optimistic concurrency)", () => {
  it("rejects a stale update and does not overwrite the newer change (the assignment's scenario)", async () => {
    const id = await createContact({ phone: "555-000-1111" });
    // User A and User B both open the contact at version 1.
    // User B saves first → version 2.
    expect((await patch(id, { version: 1, company: "Globex" })).status).toBe(200);
    // User A saves with the version they loaded.
    const res = await patch(id, { version: 1, phone: "555-999-9999" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VERSION_CONFLICT");
    // The response carries the latest state so the UI can show what changed.
    expect(res.body.error.details.current).toMatchObject({ id, version: 2, company: "Globex" });

    const doc = await stored(id);
    expect(doc).toMatchObject({ version: 2, company: "Globex", phone: "555-000-1111" });
    expect(await activities(id)).toHaveLength(1); // only B's change was recorded
  });

  it("lets exactly one of two concurrent updates with the same version win", async () => {
    const id = await createContact();
    const [a, b] = await Promise.all([
      patch(id, { version: 1, company: "From A" }),
      patch(id, { version: 1, lastName: "From B" }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    const doc = await stored(id);
    expect(doc?.version).toBe(2);
    expect(doc?.company).toBe(winner === a ? "From A" : "Acme");
    expect(doc?.lastName).toBe(winner === b ? "From B" : "Lee");
    expect(await activities(id)).toHaveLength(1);
  });

  it("lets exactly one of ten concurrent updates with the same version win", async () => {
    const id = await createContact();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => patch(id, { version: 1, company: `Writer ${i}` })),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect((await stored(id))?.version).toBe(2);
    expect(await activities(id)).toHaveLength(1);
  });

  it("still detects the conflict when the change lands between the read and the write", async () => {
    const id = await createContact();
    const staleSnapshot = await stored(id); // what the service reads first: version 1
    await patch(id, { version: 1, company: "Globex" }); // someone else → version 2

    // Make the service's first read return the stale snapshot, so the fast-path
    // check passes and only the atomic version-checked write can catch the race.
    vi.spyOn(contactRepository, "findById").mockResolvedValueOnce(staleSnapshot as never);
    const res = await patch(id, { version: 1, company: "Initech" });

    expect(res.status).toBe(409);
    expect(res.body.error.details.current).toMatchObject({ version: 2, company: "Globex" });
    expect((await stored(id))?.company).toBe("Globex");
  });

  it("returns 404, not 409, when the contact is deleted between the read and the write", async () => {
    const id = await createContact();
    const snapshot = await stored(id);
    await ContactModel.deleteOne({ _id: id });

    vi.spyOn(contactRepository, "findById").mockResolvedValueOnce(snapshot as never);
    const res = await patch(id, { version: 1, company: "Globex" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/contacts/:id — missing contacts", () => {
  it("returns 404 for a contact that doesn't exist, whatever the version", async () => {
    const res = await patch(new Types.ObjectId().toHexString(), { version: 7, company: "X" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 INVALID_ID for a malformed id", async () => {
    expect((await patch("nope", { version: 1, company: "X" })).body.error.code).toBe("INVALID_ID");
  });
});

describe("PATCH /api/contacts/:id — duplicate emails", () => {
  it("returns 409 DUPLICATE_EMAIL for another contact's email, ignoring case and spaces", async () => {
    await createContact({ firstName: "Taken", email: "taken@example.com" });
    const id = await createContact();

    const res = await patch(id, { version: 1, email: "  TAKEN@example.com " });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "DUPLICATE_EMAIL", details: { field: "email" } });
    expect(await stored(id)).toMatchObject({ email: "ann@example.com", version: 1 });
    expect(await activities(id)).toHaveLength(0); // the transaction rolled back
  });

  it("lets only one of two contacts claim the same new email concurrently", async () => {
    const a = await createContact({ email: "a@example.com" });
    const b = await createContact({ email: "b@example.com" });

    const results = await Promise.all([
      patch(a, { version: 1, email: "shared@example.com" }),
      patch(b, { version: 1, email: "shared@example.com" }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe("DUPLICATE_EMAIL");
    expect(await ContactModel.countDocuments({ email: "shared@example.com" })).toBe(1);
  });

  it("allows keeping your own email (not a conflict with yourself)", async () => {
    const id = await createContact();
    expect((await patch(id, { version: 1, email: "ann@example.com", company: "B" })).status).toBe(
      200,
    );
  });
});

describe("PATCH /api/contacts/:id — atomicity", () => {
  it("rolls back the contact change if recording the activity fails", async () => {
    const id = await createContact();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(activityRepository, "insert").mockRejectedValueOnce(
      new Error("activity write failed"),
    );

    const res = await patch(id, { version: 1, company: "Globex" });

    expect(res.status).toBe(500);
    expect(await stored(id)).toMatchObject({ company: "Acme", version: 1 });
  });
});

describe("PATCH /api/contacts/:id — validation", () => {
  it.each([
    ["missing version", { company: "X" }, "version"],
    ["version 0", { version: 0, company: "X" }, "version"],
    ["version as a string", { version: "1", company: "X" }, "version"],
    ["fractional version", { version: 1.5, company: "X" }, "version"],
    ["only a version", { version: 1 }, "body"],
    ["clearing firstName", { version: 1, firstName: "  " }, "firstName"],
    ["null firstName", { version: 1, firstName: null }, "firstName"],
    ["invalid email", { version: 1, email: "not-an-email" }, "email"],
    ["phone with too few digits", { version: 1, phone: "12-34" }, "phone"],
    ["name too long", { version: 1, lastName: "x".repeat(101) }, "lastName"],
    ["tags (have their own endpoints)", { version: 1, tags: ["vip"] }, "tags"],
    ["unknown field", { version: 1, isAdmin: true }, "isAdmin"],
  ])("rejects %s", async (_label, body, field) => {
    const id = await createContact();
    const res = await patch(id, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details.fields)).toContain(field);
    expect((await stored(id))?.version).toBe(1);
  });

  it("rejects a body that is not a JSON object", async () => {
    const id = await createContact();
    const res = await request(app)
      .patch(`/api/contacts/${id}`)
      .set("Content-Type", "application/json")
      .send("[1,2]");
    expect(res.status).toBe(400);
  });
});
