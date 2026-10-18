import { mongo } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ContactModel } from "../src/modules/contacts/contact.model.js";
import {
  buildContactDocument,
  type ContactInput,
} from "../src/modules/contacts/contact.normalize.js";
import { clearDatabase, startTestDatabase } from "./helpers/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
beforeAll(async () => {
  db = await startTestDatabase();
});
afterAll(async () => {
  await db.stop();
});
beforeEach(clearDatabase);

const create = (input: ContactInput) => ContactModel.create(buildContactDocument(input));

function expectDuplicateEmail(error: unknown) {
  expect(error).toBeInstanceOf(mongo.MongoServerError);
  expect((error as mongo.MongoServerError).code).toBe(11000);
  expect((error as mongo.MongoServerError).keyPattern).toEqual({ email: 1 });
}

describe("contact schema", () => {
  it("stores a valid contact with version 1, timestamps, and no __v", async () => {
    const contact = await create({ firstName: "Ann", lastName: "Lee", email: "ann@example.com" });
    const stored = await ContactModel.findById(contact._id).lean();
    expect(stored).toMatchObject({ firstName: "Ann", version: 1, tags: [] });
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(stored?.updatedAt).toBeInstanceOf(Date);
    expect(stored).not.toHaveProperty("__v");
  });

  it.each<[string, ContactInput]>([
    ["missing first name", { firstName: "" }],
    ["first name too long", { firstName: "a".repeat(101) }],
    ["invalid email", { firstName: "Ann", email: "not-an-email" }],
    ["phone with too few digits", { firstName: "Ann", phone: "12-34" }],
    [
      "more than 50 tags",
      { firstName: "Ann", tags: Array.from({ length: 51 }, (_, i) => `t${i}`) },
    ],
    ["tag longer than 40 characters", { firstName: "Ann", tags: ["x".repeat(41)] }],
    ["tag with invalid characters", { firstName: "Ann", tags: ["<script>"] }],
  ])("rejects %s", async (_label, input) => {
    await expect(create(input)).rejects.toThrow(/validation failed/i);
  });

  it("rejects an email that bypassed normalization", async () => {
    await expect(
      ContactModel.create({
        ...buildContactDocument({ firstName: "Ann" }),
        email: "Ann@Example.com",
      }),
    ).rejects.toThrow(/normalized/);
  });

  it("rejects unknown fields instead of silently dropping them", async () => {
    await expect(
      // Cast: the type system would block this; the test checks the runtime guard.
      ContactModel.create({
        ...buildContactDocument({ firstName: "Ann" }),
        nickname: "Annie",
      } as never),
    ).rejects.toThrow(/not in schema/i);
  });
});

describe("email uniqueness (partial unique index)", () => {
  it("rejects a second contact with the same email", async () => {
    await create({ firstName: "Ann", email: "ann@example.com" });
    const error = await create({ firstName: "Other", email: "ann@example.com" }).catch((e) => e);
    expectDuplicateEmail(error);
  });

  it("treats emails differing only in case and whitespace as the same", async () => {
    await create({ firstName: "Ann", email: "ann@example.com" });
    const error = await create({ firstName: "Other", email: "  ANN@Example.com " }).catch((e) => e);
    expectDuplicateEmail(error);
  });

  it("allows any number of contacts without an email", async () => {
    await create({ firstName: "A" });
    await create({ firstName: "B", email: "" });
    await create({ firstName: "C", email: null });
    expect(await ContactModel.countDocuments({ email: { $exists: false } })).toBe(3);
  });

  it("does not index explicit nulls either (unlike a plain unique index)", async () => {
    // Bypass Mongoose to store literal nulls, as a buggy writer might.
    const base = buildContactDocument({ firstName: "X" });
    await ContactModel.collection.insertMany([
      { ...base, email: null },
      { ...base, email: null },
    ]);
    expect(await ContactModel.countDocuments({ email: null })).toBe(2);
  });

  it("lets exactly one of many concurrent inserts with the same email succeed", async () => {
    const attempts = Array.from({ length: 10 }, (_, i) =>
      create({ firstName: `Racer${i}`, email: "race@example.com" }),
    );
    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    rejected.forEach((r) => expectDuplicateEmail(r.reason));
    expect(await ContactModel.countDocuments({ email: "race@example.com" })).toBe(1);
  });
});

describe("contact indexes", () => {
  it("creates every planned index", async () => {
    const indexes = await ContactModel.collection.indexes();
    expect(indexes.map((i) => i.name).sort()).toEqual(
      [
        "_id_",
        "email_unique",
        "createdAt_id",
        "lastName_firstName_id",
        "fullName",
        "phoneDigits",
        "tags_createdAt_id",
        "tags_lastName_firstName_id",
        "company_createdAt_id",
        "company_lastName_firstName_id",
      ].sort(),
    );
  });

  it("makes the email index unique and partial on string values", async () => {
    const emailIndex = (await ContactModel.collection.indexes()).find(
      (i) => i.name === "email_unique",
    );
    expect(emailIndex).toMatchObject({
      key: { email: 1 },
      unique: true,
      partialFilterExpression: { email: { $type: "string" } },
    });
  });
});
