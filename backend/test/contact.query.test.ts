import { describe, expect, it } from "vitest";
import {
  buildListFilter,
  buildListSort,
  escapeRegex,
} from "../src/modules/contacts/contact.query.js";

describe("escapeRegex", () => {
  it("makes regex special characters literal", () => {
    const pattern = new RegExp(`^${escapeRegex(".*")}`);
    expect(pattern.test(".*abc")).toBe(true);
    expect(pattern.test("anything")).toBe(false); // unescaped, ^.* would match everything
  });

  it.each(["(", "[a-", "a+b?", "\\", "$^|{}"])("does not produce an invalid regex for %j", (s) => {
    expect(() => new RegExp(escapeRegex(s))).not.toThrow();
  });
});

describe("buildListFilter", () => {
  it("returns an empty filter when nothing is requested", () => {
    expect(buildListFilter({})).toEqual({});
  });

  it("searches name, last name, and email by anchored lowercase prefix", () => {
    expect(buildListFilter({ q: "Ann" })).toEqual({
      $or: [
        { fullNameLower: /^ann/ },
        { lastNameLower: /^ann/ },
        { email: { $type: "string", $regex: /^ann/ } },
      ],
    });
  });

  // Regression guard: without $type, the partial email/phone indexes can't be used,
  // and rare searches scan the whole collection (docs/performance.md).
  it("repeats the partial-index filter ($type: string) on email and phone branches", () => {
    const filter = buildListFilter({ q: "555 1" }) as { $or: Record<string, unknown>[] };
    for (const field of ["email", "phoneDigits"]) {
      const branch = filter.$or.find((b) => field in b);
      expect(branch?.[field]).toMatchObject({ $type: "string" });
    }
  });

  it("adds a phone-digits clause only for phone-like input with 3+ digits", () => {
    expect(buildListFilter({ q: "(555) 12" })).toEqual({
      $or: [
        { fullNameLower: /^\(555\) 12/ },
        { lastNameLower: /^\(555\) 12/ },
        { email: { $type: "string", $regex: /^\(555\) 12/ } },
        { phoneDigits: { $type: "string", $regex: /^55512/ } },
      ],
    });
    expect(JSON.stringify(buildListFilter({ q: "ann5" }))).not.toContain("phoneDigits");
    expect(JSON.stringify(buildListFilter({ q: "55" }))).not.toContain("phoneDigits");
  });

  it("matches company case-insensitively via the lowercase field", () => {
    expect(buildListFilter({ company: "  ACME  Corp " })).toEqual({ companyLower: "acme corp" });
  });

  it("requires all selected tags", () => {
    expect(buildListFilter({ tags: ["vip", "lead"] })).toEqual({ tags: { $all: ["vip", "lead"] } });
  });

  it("combines several conditions with $and", () => {
    const filter = buildListFilter({ q: "ann", company: "acme", tags: ["vip"] });
    expect(Object.keys(filter)).toEqual(["$and"]);
    expect((filter as { $and: unknown[] }).$and).toHaveLength(3);
  });
});

describe("buildListSort", () => {
  it.each([
    ["createdAt", "desc", { createdAt: -1, _id: -1 }],
    ["createdAt", "asc", { createdAt: 1, _id: 1 }],
    ["name", "asc", { lastNameLower: 1, firstNameLower: 1, _id: 1 }],
    ["name", "desc", { lastNameLower: -1, firstNameLower: -1, _id: -1 }],
  ] as const)("%s %s ends with the _id tie-breaker", (sortBy, sortOrder, expected) => {
    expect(buildListSort({ sortBy, sortOrder })).toEqual(expected);
  });
});
