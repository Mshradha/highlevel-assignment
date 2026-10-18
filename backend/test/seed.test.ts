import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContactModel } from "../src/modules/contacts/contact.model.js";
import { normalizeEmail } from "../src/modules/contacts/contact.normalize.js";
import { assertSeedTarget, generateSeedContacts, seedDatabase } from "../src/scripts/seedData.js";
import { startTestDatabase } from "./helpers/db.js";

const NOW = new Date("2026-10-18T12:00:00Z");

describe("assertSeedTarget", () => {
  it("refuses production even with a safe-looking database name", () => {
    expect(() => assertSeedTarget("production", "crm_dev")).toThrow(/production/);
  });

  it.each(["test", "crm", "crm_prod", "dev_crm"])("refuses database %j", (name) => {
    expect(() => assertSeedTarget("development", name)).toThrow(/must end in _dev, _test, or _e2e/);
  });

  it.each(["crm_dev", "crm_test", "crm_e2e"])("allows %j", (name) => {
    expect(() => assertSeedTarget("development", name)).not.toThrow();
  });
});

describe("generateSeedContacts", () => {
  const contacts = generateSeedContacts({ count: 300, now: NOW });

  it("is deterministic for the same seed and reference time", () => {
    expect(generateSeedContacts({ count: 300, now: NOW })).toEqual(contacts);
    expect(generateSeedContacts({ count: 300, now: NOW, seed: 7 })).not.toEqual(contacts);
  });

  it("produces unique emails after normalization", () => {
    const emails = contacts.map((c) => normalizeEmail(c.email)).filter((e) => e !== undefined);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("includes the edge cases the UI and queries need", () => {
    expect(contacts.filter((c) => c.email === null).length).toBeGreaterThan(0);
    expect(contacts.filter((c) => c.phone === null).length).toBeGreaterThan(0);
    expect(contacts.filter((c) => c.company === null).length).toBeGreaterThan(0);
    expect(contacts.filter((c) => c.lastName === null).length).toBeGreaterThan(0);
    expect(contacts.some((c) => c.email !== normalizeEmail(c.email) && c.email !== null)).toBe(
      true,
    );
    // Ties for sort stability checks
    expect(
      contacts.slice(0, 3).every((c) => c.firstName === "John" && c.lastName === "Smith"),
    ).toBe(true);
    expect(contacts[3]?.createdAt.getTime()).toBe(contacts[4]?.createdAt.getTime());
  });

  it("keeps every date within the two years before the reference time", () => {
    const twoYearsAgo = NOW.getTime() - 730 * 24 * 60 * 60 * 1000;
    for (const c of contacts) {
      expect(c.createdAt.getTime()).toBeGreaterThanOrEqual(twoYearsAgo);
      expect(c.updatedAt.getTime()).toBeGreaterThanOrEqual(c.createdAt.getTime());
      expect(c.updatedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });
});

describe("seedDatabase", () => {
  let db: Awaited<ReturnType<typeof startTestDatabase>>;
  beforeAll(async () => {
    db = await startTestDatabase();
  });
  afterAll(async () => {
    await db.stop();
  });

  it("inserts normalized contacts and gives the same result when run twice", async () => {
    const first = await seedDatabase({ count: 120, now: NOW });
    const second = await seedDatabase({ count: 120, now: NOW });

    expect(first.contacts).toBe(120);
    expect(second).toEqual(first);
    expect(await ContactModel.countDocuments()).toBe(120);

    // Messy input emails were stored normalized, and derived fields exist.
    const withEmail = await ContactModel.find({ email: { $exists: true } }).lean();
    for (const c of withEmail) expect(c.email).toBe(c.email?.trim().toLowerCase());
    expect(await ContactModel.countDocuments({ fullNameLower: { $exists: false } })).toBe(0);
  });
});
