import type { Types } from "mongoose";
import type { ContactRecord } from "./contact.model.js";

/** A contact as stored, read with `.lean()` (a plain object, not a Mongoose document). */
export type ContactLean = ContactRecord & { _id: Types.ObjectId };

/**
 * The API representation. Absent optional fields become `null`, so the client
 * always receives the same shape; derived search fields are never exposed.
 */
export interface ContactDTO {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function toContactDTO(contact: ContactLean): ContactDTO {
  return {
    id: contact._id.toHexString(),
    firstName: contact.firstName,
    lastName: contact.lastName ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    company: contact.company ?? null,
    tags: contact.tags,
    version: contact.version,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}
