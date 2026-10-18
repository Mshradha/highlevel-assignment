import { type InferSchemaType, Schema, model } from "mongoose";
import { EDITABLE_CONTACT_FIELDS } from "../contacts/contact.constants.js";

export const ACTIVITY_TYPES = ["CONTACT_UPDATED", "TAG_ADDED", "TAG_REMOVED"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

const fieldChangeSchema = new Schema(
  {
    field: { type: String, required: true, enum: EDITABLE_CONTACT_FIELDS },
    // null = the field had no value before / has no value after
    from: { type: String, default: null },
    to: { type: String, default: null },
  },
  { _id: false },
);

/**
 * One document per real change. Kept in its own collection rather than an array
 * inside the contact (ADR-008): history grows without limit, while the contact
 * document must stay small for list queries and updates.
 *
 * Append-only: activities are never updated, so there is no updatedAt.
 */
const activitySchema = new Schema(
  {
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    type: { type: String, required: true, enum: ACTIVITY_TYPES },
    details: {
      changes: { type: [fieldChangeSchema], default: undefined }, // CONTACT_UPDATED only
      tag: { type: String }, // TAG_ADDED / TAG_REMOVED only
      bulkOperationId: { type: String }, // set when created by bulk tag assignment
    },
  },
  {
    collection: "contact_activities",
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    strict: "throw",
  },
);

// I10: "recent activity for contact X, newest first"
activitySchema.index({ contactId: 1, createdAt: -1, _id: -1 }, { name: "contactId_createdAt_id" });

export type ActivityRecord = InferSchemaType<typeof activitySchema>;

export const ActivityModel = model("ContactActivity", activitySchema);
