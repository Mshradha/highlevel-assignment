/**
 * Field limits shared by the Mongoose schema (last line of defence) and,
 * from Phase 5, the Zod request schemas (first line of defence).
 */
export const CONTACT_LIMITS = {
  nameMax: 100,
  companyMax: 200,
  emailMax: 254, // RFC 5321 maximum address length
  phoneMax: 30,
  phoneDigitsMin: 7,
  phoneDigitsMax: 15, // E.164 maximum
  tagMin: 1,
  tagMax: 40,
  tagsPerContactMax: 50,
} as const;

/**
 * Deliberately simple: one "@", no whitespace, a dot in the domain.
 * Full RFC 5322 validation rejects few real typos and is easy to get wrong;
 * the only reliable check is sending a confirmation email.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Letters (any language), digits, spaces, hyphens, underscores. */
export const TAG_PATTERN = /^[\p{L}\p{N} _-]+$/u;

/** Fields a client may change with PATCH. Tags have their own endpoints. */
export const EDITABLE_CONTACT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "company",
] as const;
export type EditableContactField = (typeof EDITABLE_CONTACT_FIELDS)[number];
