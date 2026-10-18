import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import type { ContactLean } from "../src/modules/contacts/contact.mapper.js";
import { buildContactDocument } from "../src/modules/contacts/contact.normalize.js";
import {
  buildProfileUpdate,
  diffProfile,
  normalizePatch,
} from "../src/modules/contacts/contact.update.js";

const stored = {
  _id: new Types.ObjectId(),
  ...buildContactDocument({
    firstName: "Ann",
    lastName: "Lee",
    email: "ann@example.com",
    phone: "(555) 123-4567",
    company: "Acme",
  }),
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
} as ContactLean;

describe("normalizePatch", () => {
  it("normalizes provided fields, marks cleared ones as undefined, and skips absent ones", () => {
    const patch = normalizePatch({ firstName: "  Anne ", email: " ANN@X.com ", company: null });
    expect(patch).toEqual({ firstName: "Anne", email: "ann@x.com", company: undefined });
    expect("company" in patch).toBe(true); // present → clear
    expect("lastName" in patch).toBe(false); // absent → unchanged
  });
});

describe("diffProfile", () => {
  it("reports only real changes, with before and after values", () => {
    const changes = diffProfile(stored, normalizePatch({ company: "Globex", lastName: null }));
    expect(changes).toEqual([
      { field: "lastName", from: "Lee", to: null },
      { field: "company", from: "Acme", to: "Globex" },
    ]);
  });

  it("finds no change when input differs only by case or whitespace", () => {
    expect(
      diffProfile(stored, normalizePatch({ email: "  ANN@Example.com ", firstName: " Ann " })),
    ).toEqual([]);
  });

  it("finds no change when clearing a field that is already empty", () => {
    const noCompany = { ...stored, company: undefined };
    expect(diffProfile(noCompany, normalizePatch({ company: "" }))).toEqual([]);
  });
});

describe("buildProfileUpdate", () => {
  it("$unsets cleared fields and their derived fields, and recomputes the full name", () => {
    const update = buildProfileUpdate(stored, [{ field: "lastName", from: "Lee", to: null }]);
    expect(update.$unset).toEqual({ lastName: "", lastNameLower: "" });
    expect(update.$set).toMatchObject({ fullNameLower: "ann", firstNameLower: "ann" });
    expect(update.$set).not.toHaveProperty("lastName");
  });

  it("updates derived search fields when a searchable field changes", () => {
    const update = buildProfileUpdate(stored, [
      { field: "firstName", from: "Ann", to: "Anne" },
      { field: "phone", from: "(555) 123-4567", to: "+44 20 7946 0000" },
    ]);
    expect(update.$set).toMatchObject({
      firstName: "Anne",
      firstNameLower: "anne",
      fullNameLower: "anne lee",
      phone: "+44 20 7946 0000",
      phoneDigits: "442079460000",
    });
    expect(update).not.toHaveProperty("$unset");
  });
});
