import { type HydratedDocument, type InferSchemaType, Schema, model } from "mongoose";
import { CONTACT_LIMITS, EMAIL_PATTERN, TAG_PATTERN } from "./contact.constants.js";
import { normalizeTag, toPhoneDigits } from "./contact.normalize.js";

const L = CONTACT_LIMITS;

/**
 * The schema is the last line of defence. Request validation (Zod, Phase 5)
 * rejects bad input first with friendly messages; these rules catch bugs in
 * our own write paths.
 */
const contactSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, minlength: 1, maxlength: L.nameMax },
    lastName: { type: String, trim: true, maxlength: L.nameMax },
    email: {
      type: String,
      maxlength: L.emailMax,
      match: EMAIL_PATTERN,
      validate: {
        validator: (v: string) => v === v.trim().toLowerCase(),
        message: "email must be stored normalized (trimmed, lowercase)",
      },
    },
    phone: {
      type: String,
      trim: true,
      maxlength: L.phoneMax,
      validate: {
        validator: (v: string) => {
          const digits = toPhoneDigits(v).length;
          return digits >= L.phoneDigitsMin && digits <= L.phoneDigitsMax;
        },
        message: `phone must contain ${L.phoneDigitsMin}-${L.phoneDigitsMax} digits`,
      },
    },
    company: { type: String, trim: true, maxlength: L.companyMax },
    tags: {
      type: [String],
      default: [],
      validate: [
        {
          validator: (tags: string[]) => tags.length <= L.tagsPerContactMax,
          message: `a contact can have at most ${L.tagsPerContactMax} tags`,
        },
        {
          validator: (tags: string[]) => new Set(tags).size === tags.length,
          message: "tags must be unique",
        },
        {
          validator: (tags: string[]) =>
            tags.every(
              (t) =>
                t === normalizeTag(t) &&
                t.length >= L.tagMin &&
                t.length <= L.tagMax &&
                TAG_PATTERN.test(t),
            ),
          message: `each tag must be normalized, ${L.tagMin}-${L.tagMax} characters, letters/digits/space/-/_`,
        },
      ],
    },
    // Optimistic concurrency token (ADR-003). Incremented by every profile update.
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      validate: { validator: Number.isInteger, message: "version must be an integer" },
    },

    // Derived search/sort fields (ADR-005). Written by buildContactDocument /
    // deriveSearchFields, never by clients, never returned by the API.
    fullNameLower: { type: String, required: true },
    firstNameLower: { type: String, required: true },
    lastNameLower: { type: String },
    companyLower: { type: String },
    phoneDigits: { type: String },
  },
  {
    collection: "contacts",
    timestamps: true, // createdAt + updatedAt, managed by Mongoose
    versionKey: false, // disable Mongoose's __v; we use our own `version` (ADR-003)
    strict: "throw", // writing an unknown field is a bug: fail instead of silently dropping it
  },
);

// ---------------------------------------------------------------------------
// Indexes (docs/01-architecture.md §4.3). Compound indexes follow E-S-R:
// Equality fields first, then Sort fields, then Range fields.
// Every sort ends with _id so the order is total and pagination is stable.
// ---------------------------------------------------------------------------

// I1: uniqueness only for real string emails. Contacts without an email have no
// `email` field, so they are not in this index and never collide (ADR-004).
contactSchema.index(
  { email: 1 },
  { name: "email_unique", unique: true, partialFilterExpression: { email: { $type: "string" } } },
);
// I2: default browse, newest first
contactSchema.index({ createdAt: -1, _id: -1 }, { name: "createdAt_id" });
// I3: sort by name; also last-name prefix search
contactSchema.index(
  { lastNameLower: 1, firstNameLower: 1, _id: 1 },
  { name: "lastName_firstName_id" },
);
// I4: first-name / "first last" prefix search
contactSchema.index({ fullNameLower: 1 }, { name: "fullName" });
// I5: phone search (only contacts that have a phone)
contactSchema.index(
  { phoneDigits: 1 },
  { name: "phoneDigits", partialFilterExpression: { phoneDigits: { $type: "string" } } },
);
// I6, I7: tag filter + each sort (multikey: one entry per tag)
contactSchema.index({ tags: 1, createdAt: -1, _id: -1 }, { name: "tags_createdAt_id" });
contactSchema.index(
  { tags: 1, lastNameLower: 1, firstNameLower: 1, _id: 1 },
  { name: "tags_lastName_firstName_id" },
);
// I8, I9: company filter + each sort
contactSchema.index({ companyLower: 1, createdAt: -1, _id: -1 }, { name: "company_createdAt_id" });
contactSchema.index(
  { companyLower: 1, lastNameLower: 1, firstNameLower: 1, _id: 1 },
  { name: "company_lastName_firstName_id" },
);

export type ContactRecord = InferSchemaType<typeof contactSchema>;
export type ContactDocument = HydratedDocument<ContactRecord>;

export const ContactModel = model("Contact", contactSchema);
