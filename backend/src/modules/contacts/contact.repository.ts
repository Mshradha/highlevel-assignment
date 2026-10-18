import type { ClientSession, QueryFilter, Types, UpdateQuery } from "mongoose";
import { CONTACT_LIMITS } from "./contact.constants.js";
import type { ContactLean } from "./contact.mapper.js";
import { type ContactRecord, ContactModel } from "./contact.model.js";
import type { ListSort } from "./contact.query.js";

/** Upper bound for list queries; a slower query fails instead of tying up the database. */
const QUERY_TIMEOUT_MS = 5_000;

/** Matches a contact with room for one more tag: index 49 (the 50th tag) doesn't exist. */
const HAS_ROOM_FOR_TAG = { [`tags.${CONTACT_LIMITS.tagsPerContactMax - 1}`]: { $exists: false } };

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

  /**
   * THE optimistic-concurrency write (ADR-003). The version check and the write
   * are one atomic operation: the update only applies if the document still has
   * `expectedVersion`, and it increments the version in the same step. Two
   * requests holding the same version can't both match — the first one changes
   * the version, so the second finds nothing.
   *
   * Returns null when nothing matched: either the contact doesn't exist or its
   * version moved on. The caller decides which (404 vs 409).
   */
  updateIfVersion(
    id: string,
    expectedVersion: number,
    update: UpdateQuery<ContactRecord>,
    session: ClientSession,
  ): Promise<ContactLean | null> {
    return ContactModel.findOneAndUpdate(
      { _id: id, version: expectedVersion },
      { ...update, $inc: { version: 1 } },
      { returnDocument: "after", runValidators: true, session },
    )
      .lean<ContactLean>()
      .exec();
  },

  /**
   * Adds `tag` only if the contact doesn't have it and has room for it. The
   * conditions are in the filter, so "did this change anything?" is answered
   * atomically by the database: a match means the tag was really added. Two
   * concurrent adds of the same tag can't both match. Tags don't touch
   * `version` (ADR-007): set operations can't overwrite each other's work.
   */
  addTagIfAbsent(id: string, tag: string, session: ClientSession): Promise<ContactLean | null> {
    return ContactModel.findOneAndUpdate(
      { _id: id, tags: { $ne: tag }, ...HAS_ROOM_FOR_TAG },
      { $push: { tags: tag } },
      { returnDocument: "after", session },
    )
      .lean<ContactLean>()
      .exec();
  },

  /** Removes `tag` only if present; a match means the tag was really removed. */
  removeTagIfPresent(id: string, tag: string, session: ClientSession): Promise<ContactLean | null> {
    return ContactModel.findOneAndUpdate(
      { _id: id, tags: tag },
      { $pull: { tags: tag } },
      { returnDocument: "after", session },
    )
      .lean<ContactLean>()
      .exec();
  },

  /** The tags of every contact in `ids` that exists (used to classify a bulk request). */
  findTagsByIds(
    ids: string[],
    session: ClientSession,
  ): Promise<Array<{ _id: Types.ObjectId; tags: string[] }>> {
    return ContactModel.find({ _id: { $in: ids } }, { tags: 1 })
      .session(session)
      .lean<Array<{ _id: Types.ObjectId; tags: string[] }>>()
      .exec();
  },

  /** Same guards as addTagIfAbsent, applied to many contacts. Returns how many changed. */
  async addTagToMany(ids: Types.ObjectId[], tag: string, session: ClientSession): Promise<number> {
    const result = await ContactModel.updateMany(
      { _id: { $in: ids }, tags: { $ne: tag }, ...HAS_ROOM_FOR_TAG },
      { $push: { tags: tag } },
      { session },
    ).exec();
    return result.modifiedCount;
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
