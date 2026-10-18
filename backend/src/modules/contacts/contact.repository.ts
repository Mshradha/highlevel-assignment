import type { ClientSession } from "mongoose";
import type { ContactLean } from "./contact.mapper.js";
import { ContactModel } from "./contact.model.js";

/**
 * All database access for contacts. Functions take an optional session so the
 * same query can run inside a transaction. No business rules here: the
 * repository answers "what's in the database", the service decides what it means.
 */
export const contactRepository = {
  findById(id: string, session?: ClientSession): Promise<ContactLean | null> {
    return ContactModel.findById(id)
      .session(session ?? null)
      .lean<ContactLean>()
      .exec();
  },
};
