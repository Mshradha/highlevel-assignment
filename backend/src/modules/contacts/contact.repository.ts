import type { ClientSession, QueryFilter } from "mongoose";
import type { ContactLean } from "./contact.mapper.js";
import { type ContactRecord, ContactModel } from "./contact.model.js";
import type { ListSort } from "./contact.query.js";

/** Upper bound for list queries; a slower query fails instead of tying up the database. */
const QUERY_TIMEOUT_MS = 5_000;

export interface ListOptions {
  filter: QueryFilter<ContactRecord>;
  sort: ListSort;
  skip: number;
  limit: number;
}

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

  /** One page of contacts plus the total number of matches, fetched in parallel. */
  async list({
    filter,
    sort,
    skip,
    limit,
  }: ListOptions): Promise<{ items: ContactLean[]; total: number }> {
    const isUnfiltered = Object.keys(filter).length === 0;
    const [items, total] = await Promise.all([
      ContactModel.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .maxTimeMS(QUERY_TIMEOUT_MS)
        .lean<ContactLean[]>()
        .exec(),
      // With no filter, read the count from collection metadata instead of
      // walking an index entry for every contact.
      isUnfiltered
        ? ContactModel.estimatedDocumentCount({ maxTimeMS: QUERY_TIMEOUT_MS }).exec()
        : ContactModel.countDocuments(filter).maxTimeMS(QUERY_TIMEOUT_MS).exec(),
    ]);
    return { items, total };
  },
};
