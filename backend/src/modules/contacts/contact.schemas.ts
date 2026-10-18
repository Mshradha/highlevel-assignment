import { z } from "zod";
import { objectIdSchema } from "../../shared/validation/schemas.js";
import { CONTACT_LIMITS, TAG_PATTERN } from "./contact.constants.js";
import { normalizeTag } from "./contact.normalize.js";

export const LIST_LIMITS = {
  qMin: 2, // a 1-character prefix matches a large share of a big collection
  qMax: 100,
  defaultLimit: 20,
  maxLimit: 100,
  // Offset pagination still walks every skipped index entry, so bound the depth.
  maxOffset: 10_000,
  maxTagFilters: 10,
} as const;

/** `?q=` (an empty box in the UI) means "no search", not "search for nothing". */
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const tagSchema = z
  .string()
  .min(CONTACT_LIMITS.tagMin)
  .max(CONTACT_LIMITS.tagMax)
  .regex(TAG_PATTERN, "may only contain letters, digits, spaces, - and _");

/** Accepts `?tags=vip,lead` and `?tags=vip&tags=lead`; normalizes and de-duplicates. */
const tagsFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => {
    const parts = (Array.isArray(value) ? value : [value]).flatMap((v) => v.split(","));
    return [...new Set(parts.map(normalizeTag).filter((t) => t !== ""))];
  })
  .pipe(z.array(tagSchema).max(LIST_LIMITS.maxTagFilters));

/**
 * GET /api/contacts query string. Strict: an unknown parameter (a typo like
 * `?sort=name`, or `?company[$ne]=x`) is a 400 rather than silently ignored.
 */
export const listContactsQuerySchema = z
  .strictObject({
    q: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(LIST_LIMITS.qMin).max(LIST_LIMITS.qMax).optional(),
    ),
    company: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(CONTACT_LIMITS.companyMax).optional(),
    ),
    tags: z.preprocess(emptyToUndefined, tagsFilterSchema.optional()),
    sortBy: z.enum(["name", "createdAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(LIST_LIMITS.maxLimit)
      .default(LIST_LIMITS.defaultLimit),
  })
  .refine((v) => (v.page - 1) * v.limit <= LIST_LIMITS.maxOffset, {
    path: ["page"],
    message: `page is too deep (more than ${LIST_LIMITS.maxOffset} results in); narrow the search instead`,
  })
  // Natural default direction: newest first for dates, A→Z for names.
  .transform((v) => ({ ...v, sortOrder: v.sortOrder ?? (v.sortBy === "name" ? "asc" : "desc") }));

export type ListContactsQuery = z.output<typeof listContactsQuerySchema>;

// ---------------------------------------------------------------------------
// PATCH /api/contacts/:id
// ---------------------------------------------------------------------------

/** For optional fields, "" and whitespace mean "clear this field", same as null. */
const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const L = CONTACT_LIMITS;

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());

/**
 * Partial update. `version` is the version the client last saw (optimistic
 * concurrency, ADR-003). A field that is absent stays unchanged; `null` or ""
 * clears an optional field. `firstName` is required on every contact, so it
 * can be changed but never cleared. Tags are not accepted here: they have
 * their own endpoints (requirement A12).
 */
export const updateContactBodySchema = z
  .strictObject({
    version: z.number().int().min(1),
    firstName: z.string().trim().min(1, "First name is required").max(L.nameMax).optional(),
    lastName: optionalText(L.nameMax),
    email: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .max(L.emailMax)
        .pipe(z.email("Invalid email address"))
        .nullable()
        .optional(),
    ),
    phone: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .max(L.phoneMax)
        .refine((v) => {
          const digits = v.replace(/\D/g, "").length;
          return digits >= L.phoneDigitsMin && digits <= L.phoneDigitsMax;
        }, `Phone must contain ${L.phoneDigitsMin}-${L.phoneDigitsMax} digits`)
        .nullable()
        .optional(),
    ),
    company: optionalText(L.companyMax),
  })
  .refine((body) => Object.keys(body).some((key) => key !== "version"), {
    message: "Provide at least one field to update",
  });

export type UpdateContactBody = z.output<typeof updateContactBodySchema>;

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** Normalizes first (" VIP " → "vip"), then validates the stored form. */
const normalizedTagSchema = z.string().transform(normalizeTag).pipe(tagSchema);

export const addTagBodySchema = z.strictObject({ tag: normalizedTagSchema });

/** DELETE /api/contacts/:id/tags/:tag — Express has already URL-decoded :tag. */
export const tagParamsSchema = z.object({ id: objectIdSchema, tag: normalizedTagSchema });

export const BULK_LIMITS = { maxContacts: 500 } as const;

/**
 * POST /api/contacts/bulk-tags. Duplicate ids are removed, so each contact is
 * counted once. 500 ids keeps one transaction small and fast (ADR-009).
 */
export const bulkTagBodySchema = z.strictObject({
  contactIds: z
    .array(objectIdSchema)
    .min(1, "Select at least one contact")
    .max(BULK_LIMITS.maxContacts, `At most ${BULK_LIMITS.maxContacts} contacts per request`)
    .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]),
  tag: normalizedTagSchema,
});

export type BulkTagBody = z.output<typeof bulkTagBodySchema>;

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const listActivitiesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
