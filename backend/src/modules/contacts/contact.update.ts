import type { FieldChange } from "../activities/activity.repository.js";
import { EDITABLE_CONTACT_FIELDS, type EditableContactField } from "./contact.constants.js";
import type { ContactLean } from "./contact.mapper.js";
import {
  type ContactProfile,
  deriveSearchFields,
  normalizeEmail,
  normalizeOptionalText,
  normalizeRequiredText,
} from "./contact.normalize.js";
import type { UpdateContactBody } from "./contact.schemas.js";

/**
 * Field → new normalized value. A key that is present with `undefined` means
 * "clear this field"; a key that is absent means "leave it alone".
 */
export type ProfilePatch = Partial<Record<EditableContactField, string | undefined>>;

export function normalizePatch(body: Omit<UpdateContactBody, "version">): ProfilePatch {
  const patch: ProfilePatch = {};
  if (body.firstName !== undefined) patch.firstName = normalizeRequiredText(body.firstName);
  if (body.lastName !== undefined) patch.lastName = normalizeOptionalText(body.lastName);
  if (body.email !== undefined) patch.email = normalizeEmail(body.email);
  if (body.phone !== undefined) patch.phone = normalizeOptionalText(body.phone);
  if (body.company !== undefined) patch.company = normalizeOptionalText(body.company);
  return patch;
}

/**
 * Only real changes, compared after normalization: sending " ANN@x.com " for a
 * stored "ann@x.com" is not a change. An empty result means a no-op update.
 */
export function diffProfile(current: ContactLean, patch: ProfilePatch): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of EDITABLE_CONTACT_FIELDS) {
    if (!(field in patch)) continue;
    const from = current[field] ?? null;
    const to = patch[field] ?? null;
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

const DERIVED_FIELDS = [
  "fullNameLower",
  "firstNameLower",
  "lastNameLower",
  "companyLower",
  "phoneDigits",
] as const;

/**
 * The MongoDB update for a set of changes. Cleared fields are `$unset` (never
 * stored as null or ""), and every derived search field is recomputed from the
 * resulting profile, so search can never see stale values.
 */
export function buildProfileUpdate(current: ContactLean, changes: FieldChange[]) {
  const next: ContactProfile = {
    firstName: current.firstName,
    lastName: current.lastName ?? undefined,
    email: current.email ?? undefined,
    phone: current.phone ?? undefined,
    company: current.company ?? undefined,
  };
  for (const { field, to } of changes) {
    if (field === "firstName") {
      next.firstName = to!; // the schema never allows clearing it
    } else {
      next[field] = to ?? undefined;
    }
  }

  const $set: Record<string, string> = {};
  const $unset: Record<string, ""> = {};
  for (const { field, to } of changes) {
    if (to === null) $unset[field] = "";
    else $set[field] = to;
  }
  const derived: Partial<Record<(typeof DERIVED_FIELDS)[number], string>> =
    deriveSearchFields(next);
  for (const key of DERIVED_FIELDS) {
    const value = derived[key];
    if (value === undefined) $unset[key] = "";
    else $set[key] = value;
  }

  return Object.keys($unset).length > 0 ? { $set, $unset } : { $set };
}
