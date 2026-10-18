/**
 * Every write path (seed, update, tag operations) normalizes values with these
 * functions, so the same input always produces the same stored value.
 *
 * Convention: `undefined` means "no value". Callers store nothing for it
 * (or `$unset` it) — never "" or null. See ADR-004.
 */

/** Trim, collapse runs of whitespace, and use the NFC Unicode form ("é" has one encoding). */
export function normalizeRequiredText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** For optional free-text fields: empty, null, and undefined all become `undefined`. */
export function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const cleaned = normalizeRequiredText(value);
  return cleaned === "" ? undefined : cleaned;
}

/** Trim + lowercase the whole address. No provider-specific rules (dots, +aliases). */
export function normalizeEmail(value: string | null | undefined): string | undefined {
  return normalizeOptionalText(value)?.toLowerCase();
}

/** Phone is stored as typed (trimmed); this is the searchable form. */
export function toPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** "  VIP  Customer " → "vip customer" */
export function normalizeTag(value: string): string {
  return normalizeRequiredText(value).toLowerCase();
}

export interface ContactProfile {
  firstName: string;
  lastName?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  company?: string | undefined;
}

export interface DerivedSearchFields {
  fullNameLower: string;
  firstNameLower: string;
  lastNameLower?: string;
  companyLower?: string;
  phoneDigits?: string;
}

/**
 * Lowercase copies used by indexes for case-insensitive prefix search and sorting
 * (ADR-005). Computed explicitly by callers instead of in a Mongoose hook, because
 * hooks don't run for findOneAndUpdate — derived fields would silently go stale.
 */
export function deriveSearchFields(profile: ContactProfile): DerivedSearchFields {
  const firstNameLower = profile.firstName.toLowerCase();
  const lastNameLower = profile.lastName?.toLowerCase();
  return {
    fullNameLower: lastNameLower ? `${firstNameLower} ${lastNameLower}` : firstNameLower,
    firstNameLower,
    ...(lastNameLower !== undefined && { lastNameLower }),
    ...(profile.company !== undefined && { companyLower: profile.company.toLowerCase() }),
    ...(profile.phone !== undefined && { phoneDigits: toPhoneDigits(profile.phone) }),
  };
}

export interface ContactInput {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  tags?: string[];
}

/**
 * Turns raw input into the stored shape: normalized values, absent optional
 * fields, unique normalized tags, and derived search fields.
 */
export function buildContactDocument(input: ContactInput) {
  const profile: ContactProfile = {
    firstName: normalizeRequiredText(input.firstName),
    lastName: normalizeOptionalText(input.lastName),
    email: normalizeEmail(input.email),
    phone: normalizeOptionalText(input.phone),
    company: normalizeOptionalText(input.company),
  };
  const present = Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined),
  ) as ContactProfile;

  return {
    ...present,
    tags: [...new Set((input.tags ?? []).map(normalizeTag))],
    ...deriveSearchFields(present),
  };
}
