import { ActivityModel } from "../modules/activities/activity.model.js";
import { ContactModel } from "../modules/contacts/contact.model.js";
import { buildContactDocument, type ContactInput } from "../modules/contacts/contact.normalize.js";

// ---------------------------------------------------------------------------
// Safety guard
// ---------------------------------------------------------------------------

const SAFE_DB_NAME = /_(dev|test|e2e)$/;

/**
 * The seed deletes every contact and activity. Two independent checks must pass:
 * not production, and a database name that is clearly disposable. The name check
 * also catches a URI without a database name, where MongoDB uses "test".
 */
export function assertSeedTarget(nodeEnv: string, dbName: string): void {
  if (nodeEnv === "production") {
    throw new Error("Refusing to seed: NODE_ENV is production.");
  }
  if (!SAFE_DB_NAME.test(dbName)) {
    throw new Error(
      `Refusing to seed database "${dbName}": the seed deletes all contacts, ` +
        "so the database name must end in _dev, _test, or _e2e.",
    );
  }
}

// ---------------------------------------------------------------------------
// Deterministic data generation
// ---------------------------------------------------------------------------

/** Small seeded PRNG (mulberry32): the same seed always gives the same data. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    chance: (probability: number) => next() < probability,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
  };
}

// Names chosen to exercise search: "ann" prefix-matches Ann/Anna/Annette but not Joanne;
// accented and multi-word names test Unicode and whitespace handling.
// prettier-ignore
const FIRST_NAMES = [
  "Ann", "Anna", "Annette", "Joanne", "John", "Johnny", "Jon", "Maria", "Mario", "Marie", "Liam",
  "Olivia", "Noah", "Emma", "Ava", "Sophia", "Isabella", "Mia", "Lucas", "Ethan", "Priya",
  "Rahul", "Aarav", "Ananya", "Wei", "Mei", "Hiroshi", "Yuki", "Fatima", "Omar", "Carlos",
  "Lucía", "José", "Chloé", "Zoë", "Sam", "Alex", "Taylor", "Jordan", "Chris",
] as const;

// prettier-ignore
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez",
  "Martinez", "Lee", "Patel", "Sharma", "Kumar", "Chen", "Wang", "Tanaka", "Sato", "Khan", "Ali",
  "O'Brien", "McDonald", "van der Berg", "Nguyen", "Kim", "Silva", "Rossi", "Müller", "Dubois",
  "Anderson",
] as const;

// prettier-ignore
const COMPANIES = [
  "Acme Corp", "Globex", "Initech", "Umbrella Labs", "Stark Industries", "Wayne Enterprises",
  "Hooli", "Pied Piper", "Soylent", "Wonka Industries", "Cyberdyne", "Tyrell Corp",
  "Vandelay Industries", "Bluth Company",
] as const;

// prettier-ignore
const TAGS = [
  "vip", "lead", "customer", "prospect", "partner", "newsletter", "churn risk", "enterprise",
  "smb", "follow-up", "event 2026", "referral",
] as const;

const EMAIL_DOMAINS = ["example.com", "mail.test", "acme.example", "inbox.test"] as const;

/** "José van der Berg" → "jose.vanderberg" */
function emailLocalPart(first: string, last: string | undefined): string {
  const ascii = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
  return last ? `${ascii(first)}.${ascii(last)}` : ascii(first);
}

function randomPhone(random: ReturnType<typeof createRandom>): string {
  const area = random.int(200, 989);
  const mid = random.int(200, 999);
  const end = String(random.int(0, 9999)).padStart(4, "0");
  // Different formats for the same kind of number; search uses digits only.
  return random.pick([
    `(${area}) ${mid}-${end}`,
    `+1 ${area} ${mid} ${end}`,
    `${area}.${mid}.${end}`,
    `${area}${mid}${end}`,
  ]);
}

export type SeedContact = ContactInput & { createdAt: Date; updatedAt: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GenerateOptions {
  count: number;
  seed?: number;
  /** Reference time; createdAt values fall in the two years before it. */
  now?: Date;
}

export function generateSeedContacts({
  count,
  seed = 42,
  now = new Date(),
}: GenerateOptions): SeedContact[] {
  const random = createRandom(seed);
  const usedEmails = new Set<string>();
  const contacts: SeedContact[] = [];

  for (let i = 0; i < count; i++) {
    // The first three are all "John Smith" to show the _id tie-breaker in name sorting.
    const firstName = i < 3 ? "John" : random.pick(FIRST_NAMES);
    const lastName = i < 3 ? "Smith" : random.chance(0.05) ? undefined : random.pick(LAST_NAMES);

    let email: string | undefined;
    if (i < 3 || !random.chance(0.1)) {
      const base = emailLocalPart(firstName, lastName);
      const domain = random.pick(EMAIL_DOMAINS);
      let candidate = `${base}@${domain}`;
      for (let n = 2; usedEmails.has(candidate); n++) candidate = `${base}${n}@${domain}`;
      usedEmails.add(candidate);
      // Some emails arrive messy, the way users type them; normalization cleans them.
      email = random.chance(0.15)
        ? `  ${candidate.replace(/^./, (c) => c.toUpperCase())} `
        : candidate;
    }

    const tagCount = random.int(0, 4);
    const tags = new Set<string>();
    while (tags.size < tagCount) tags.add(random.pick(TAGS));

    const createdAt = new Date(now.getTime() - random.int(0, 730 * DAY_MS));
    // Contacts 3 and 4 share a createdAt to show the _id tie-breaker in date sorting.
    if (i === 4) {
      const previous = contacts[3];
      if (previous) createdAt.setTime(previous.createdAt.getTime());
    }
    const updatedAt = random.chance(0.4)
      ? createdAt
      : new Date(createdAt.getTime() + random.int(0, now.getTime() - createdAt.getTime()));

    contacts.push({
      firstName,
      lastName: lastName ?? null,
      email: email ?? null,
      phone: random.chance(0.15) ? null : randomPhone(random),
      company: random.chance(0.12) ? null : random.pick(COMPANIES),
      tags: [...tags],
      createdAt,
      updatedAt,
    });
  }
  return contacts;
}

// ---------------------------------------------------------------------------
// Writing to the database
// ---------------------------------------------------------------------------

export interface SeedSummary {
  contacts: number;
  withoutEmail: number;
  withoutPhone: number;
  withoutCompany: number;
  withoutLastName: number;
}

const BATCH_SIZE = 1_000;

/**
 * Replaces all contacts and activities with freshly generated data.
 * The caller must run assertSeedTarget first. Running it twice gives the same result.
 */
export async function seedDatabase(options: GenerateOptions): Promise<SeedSummary> {
  await ContactModel.deleteMany({});
  await ActivityModel.deleteMany({});
  // Make the database's indexes match the schemas exactly (creates missing, drops stale).
  await ContactModel.syncIndexes();
  await ActivityModel.syncIndexes();

  const contacts = generateSeedContacts(options);
  for (let start = 0; start < contacts.length; start += BATCH_SIZE) {
    const batch = contacts
      .slice(start, start + BATCH_SIZE)
      .map(({ createdAt, updatedAt, ...input }) => ({
        ...buildContactDocument(input),
        createdAt,
        updatedAt,
      }));
    // insertMany validates every document against the schema before writing.
    await ContactModel.insertMany(batch, { ordered: true });
  }

  const [total, withoutEmail, withoutPhone, withoutCompany, withoutLastName] = await Promise.all([
    ContactModel.countDocuments(),
    ContactModel.countDocuments({ email: { $exists: false } }),
    ContactModel.countDocuments({ phone: { $exists: false } }),
    ContactModel.countDocuments({ company: { $exists: false } }),
    ContactModel.countDocuments({ lastName: { $exists: false } }),
  ]);
  return { contacts: total, withoutEmail, withoutPhone, withoutCompany, withoutLastName };
}
