import { describe, expect, it } from "vitest";
import {
  buildContactDocument,
  deriveSearchFields,
  normalizeEmail,
  normalizeOptionalText,
  normalizeTag,
  toPhoneDigits,
} from "../src/modules/contacts/contact.normalize.js";

describe("normalizeEmail", () => {
  it("trims and lowercases the whole address", () => {
    expect(normalizeEmail("  Ann.Lee@Example.COM ")).toBe("ann.lee@example.com");
  });

  it("keeps dots and +aliases (no provider-specific rules)", () => {
    expect(normalizeEmail("a.b+crm@gmail.com")).toBe("a.b+crm@gmail.com");
  });

  it.each([[""], ["   "], [null], [undefined]])("treats %j as no email", (input) => {
    expect(normalizeEmail(input)).toBeUndefined();
  });
});

describe("normalizeOptionalText", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeOptionalText("  Acme   Corp \t")).toBe("Acme Corp");
  });

  it("uses one Unicode form, so visually equal names are stored equally", () => {
    const decomposed = "José"; // "e" + combining accent
    expect(normalizeOptionalText(decomposed)).toBe("José"); // single precomposed "é"
  });
});

describe("toPhoneDigits", () => {
  it.each([
    ["(555) 123-4567", "5551234567"],
    ["+1 555 123 4567", "15551234567"],
    ["555.123.4567", "5551234567"],
  ])("%s → %s", (input, digits) => {
    expect(toPhoneDigits(input)).toBe(digits);
  });
});

describe("normalizeTag", () => {
  it("trims, collapses spaces, and lowercases", () => {
    expect(normalizeTag("  VIP   Customer ")).toBe("vip customer");
  });
});

describe("deriveSearchFields", () => {
  it("builds lowercase search fields from the profile", () => {
    expect(
      deriveSearchFields({
        firstName: "Ann",
        lastName: "Lee",
        company: "Acme",
        phone: "(555) 123-4567",
      }),
    ).toEqual({
      fullNameLower: "ann lee",
      firstNameLower: "ann",
      lastNameLower: "lee",
      companyLower: "acme",
      phoneDigits: "5551234567",
    });
  });

  it("omits fields for missing values instead of storing empty ones", () => {
    expect(deriveSearchFields({ firstName: "Ann" })).toEqual({
      fullNameLower: "ann",
      firstNameLower: "ann",
    });
  });
});

describe("buildContactDocument", () => {
  it("leaves out empty optional fields entirely (no null, no empty string)", () => {
    const doc = buildContactDocument({
      firstName: " Ann ",
      lastName: "",
      email: "   ",
      phone: null,
      company: undefined,
    });
    expect(doc).toEqual({
      firstName: "Ann",
      tags: [],
      fullNameLower: "ann",
      firstNameLower: "ann",
    });
    expect("email" in doc).toBe(false);
  });

  it("normalizes and de-duplicates tags", () => {
    const doc = buildContactDocument({ firstName: "Ann", tags: ["VIP", "vip ", " Vip", "Lead"] });
    expect(doc.tags).toEqual(["vip", "lead"]);
  });
});
