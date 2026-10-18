import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ContactModel } from "../src/modules/contacts/contact.model.js";
import {
  buildContactDocument,
  type ContactInput,
} from "../src/modules/contacts/contact.normalize.js";
import { startTestDatabase } from "./helpers/db.js";

const app = createApp();
const day = (n: number) => new Date(Date.UTC(2026, 0, n));

// A small fixed data set where every expected result can be worked out by hand.
// These tests only read, so one shared fixture is safe and keeps them fast.
// prettier-ignore
const FIXTURES: Array<ContactInput & { key: string; createdAt: Date }> = [
  { key: "ann",     firstName: "Ann",     lastName: "Lee",   email: "ann.lee@acme.com", phone: "(555) 123-4567", company: "Acme",    tags: ["vip", "lead"], createdAt: day(1) },
  { key: "anna",    firstName: "Anna",    lastName: "Kim",   email: "anna@globex.com",                           company: "Globex",  tags: ["vip"],         createdAt: day(2) },
  { key: "annette", firstName: "Annette", lastName: "Brown",                                                     company: "ACME",    tags: ["lead"],        createdAt: day(3) },
  { key: "joanne",  firstName: "Joanne",  lastName: "Smith", email: "joanne@acme.com",                           company: "Acme",    tags: ["vip"],         createdAt: day(4) },
  // Three identical names AND identical createdAt: only _id can order them.
  { key: "john1",   firstName: "John",    lastName: "Smith", email: "john1@x.com",                                                                      createdAt: day(5) },
  { key: "john2",   firstName: "John",    lastName: "Smith", email: "john2@x.com",                                                                      createdAt: day(5) },
  { key: "john3",   firstName: "John",    lastName: "Smith", email: "john3@x.com",                                                                      createdAt: day(5) },
  { key: "bob",     firstName: "Bob",  /* no last name */                           phone: "555.999.0000",                                              createdAt: day(6) },
  { key: "zed",     firstName: "Zed",     lastName: "Adams", email: "zed@initech.com",                           company: "Initech", tags: ["partner"],     createdAt: day(7) },
  { key: "leena",   firstName: "Leena",   lastName: "Patel", email: "leena@acme.com",                            company: "Acme",    tags: ["customer"],    createdAt: day(8) },
];

const keyById = new Map<string, string>();
let db: Awaited<ReturnType<typeof startTestDatabase>>;

beforeAll(async () => {
  db = await startTestDatabase();
  // insertMany assigns ObjectIds in array order, so _id order = fixture order.
  const inserted = await ContactModel.insertMany(
    FIXTURES.map(({ key: _key, createdAt, ...input }) => ({
      ...buildContactDocument(input),
      createdAt,
      updatedAt: createdAt,
    })),
  );
  inserted.forEach((doc, i) => keyById.set(doc._id.toHexString(), FIXTURES[i]!.key));
});

afterAll(async () => {
  await db.stop();
});

/** GET /api/contacts?<query> and return the fixture keys in response order. */
async function keys(query: string): Promise<string[]> {
  const res = await request(app).get(`/api/contacts?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.map((c: { id: string }) => keyById.get(c.id));
}

describe("GET /api/contacts — response shape", () => {
  it("returns a page of DTOs with pagination, newest first by default", async () => {
    const res = await request(app).get("/api/contacts?limit=3");
    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 1, limit: 3, total: 10, totalPages: 4 });
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      "company",
      "createdAt",
      "email",
      "firstName",
      "id",
      "lastName",
      "phone",
      "tags",
      "updatedAt",
      "version",
    ]);
  });

  it("returns an empty page, not an error, when nothing matches", async () => {
    const res = await request(app).get("/api/contacts?company=nobody");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it("returns an empty page with the real total when the page is past the end", async () => {
    const res = await request(app).get("/api/contacts?page=5&limit=3");
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 5, limit: 3, total: 10, totalPages: 4 });
  });
});

describe("GET /api/contacts — search", () => {
  it("matches name prefixes, not substrings: 'ann' finds Ann/Anna/Annette but not Joanne", async () => {
    expect((await keys("q=ann")).sort()).toEqual(["ann", "anna", "annette"]);
  });

  it("is case-insensitive", async () => {
    expect((await keys("q=ANN")).sort()).toEqual(["ann", "anna", "annette"]);
  });

  it("matches a last-name prefix as well as a first-name prefix", async () => {
    // "Lee" is Ann's last name; "Leena" is a first name.
    expect((await keys("q=lee")).sort()).toEqual(["ann", "leena"]);
  });

  it("matches 'first last'", async () => {
    expect(await keys("q=ann%20lee")).toEqual(["ann"]);
  });

  it("matches an email prefix", async () => {
    expect(await keys("q=ann.lee%40")).toEqual(["ann"]);
  });

  it("matches phone digits whatever the formatting", async () => {
    expect(await keys("q=555-123")).toEqual(["ann"]);
    expect((await keys("q=(555)")).sort()).toEqual(["ann", "bob"]);
  });

  it("treats regex characters literally instead of matching everything", async () => {
    expect(await keys("q=.*")).toEqual([]);
    expect(await keys("q=a(")).toEqual([]);
  });

  it("treats an empty q as no search", async () => {
    expect(await keys("q=")).toHaveLength(10);
  });
});

describe("GET /api/contacts — filters", () => {
  it("filters by company, case-insensitively", async () => {
    const expected = ["ann", "annette", "joanne", "leena"];
    expect((await keys("company=acme")).sort()).toEqual(expected);
    expect((await keys("company=%20ACME%20")).sort()).toEqual(expected);
  });

  it("filters by one tag, normalizing the input", async () => {
    expect((await keys("tags=%20VIP%20")).sort()).toEqual(["ann", "anna", "joanne"]);
  });

  it("requires all tags, in either query-string form", async () => {
    expect(await keys("tags=vip,lead")).toEqual(["ann"]);
    expect(await keys("tags=vip&tags=lead")).toEqual(["ann"]);
  });

  it("combines search, company, and tags", async () => {
    expect((await keys("q=ann&company=acme&tags=lead")).sort()).toEqual(["ann", "annette"]);
  });
});

describe("GET /api/contacts — sorting", () => {
  // Note: the indexes already order equal keys by _id, so these tests would still
  // pass if the sort lost its _id tie-breaker. contact.query.test.ts guards the
  // sort specification itself (verified by removing _id: those tests fail).
  it("sorts by createdAt desc by default, breaking ties by _id", async () => {
    expect(await keys("")).toEqual([
      "leena",
      "zed",
      "bob",
      "john3",
      "john2",
      "john1",
      "joanne",
      "annette",
      "anna",
      "ann",
    ]);
  });

  it("sorts by createdAt asc", async () => {
    expect(await keys("sortBy=createdAt&sortOrder=asc")).toEqual([
      "ann",
      "anna",
      "annette",
      "joanne",
      "john1",
      "john2",
      "john3",
      "bob",
      "zed",
      "leena",
    ]);
  });

  it("sorts by last name, then first name, then _id (A→Z by default)", async () => {
    // Bob has no last name, so he sorts first.
    expect(await keys("sortBy=name")).toEqual([
      "bob",
      "zed",
      "annette",
      "anna",
      "ann",
      "leena",
      "joanne",
      "john1",
      "john2",
      "john3",
    ]);
  });

  it("sorts by name descending as the exact reverse", async () => {
    expect(await keys("sortBy=name&sortOrder=desc")).toEqual([
      "john3",
      "john2",
      "john1",
      "joanne",
      "leena",
      "ann",
      "anna",
      "annette",
      "zed",
      "bob",
    ]);
  });
});

describe("GET /api/contacts — pagination", () => {
  it.each(["sortBy=createdAt", "sortBy=name"])(
    "returns every contact exactly once across pages (%s)",
    async (sort) => {
      const seen: string[] = [];
      for (let page = 1; page <= 4; page++)
        seen.push(...(await keys(`${sort}&limit=3&page=${page}`)));
      expect(seen).toHaveLength(10);
      expect(new Set(seen).size).toBe(10);
    },
  );
});

describe("GET /api/contacts — validation", () => {
  it.each([
    ["limit=101", "query.limit"],
    ["limit=0", "query.limit"],
    ["page=0", "query.page"],
    ["page=abc", "query.page"],
    ["page=1.5", "query.page"],
    ["page=502", "query.page"], // offset 10,020 > 10,000
    ["q=a", "query.q"], // too short
    ["sortBy=email", "query.sortBy"],
    ["sortOrder=up", "query.sortOrder"],
    ["foo=1", "query.foo"], // unknown parameter
    ["company[$ne]=x", "query.company[$ne]"], // operator injection attempt
    ["q=ann&q=bob", "query.q"], // repeated scalar parameter
    ["tags=%3Cb%3E", "query.tags.0"], // "<b>"
    [`tags=${Array.from({ length: 11 }, (_, i) => `t${i}`).join(",")}`, "query.tags"],
  ])("rejects %s with an error on %s", async (query, field) => {
    const res = await request(app).get(`/api/contacts?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details.fields)).toContain(field);
  });

  it("accepts the deepest allowed page", async () => {
    expect((await request(app).get("/api/contacts?page=501")).status).toBe(200); // offset 10,000
  });
});
