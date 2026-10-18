import mongoose from "mongoose";
import { errors } from "../../shared/errors.js";
import { runInTransaction } from "../../shared/transaction.js";
import { activityRepository } from "../activities/activity.repository.js";
import { type ContactLean, toContactDTO } from "./contact.mapper.js";
import { buildListFilter, buildListSort } from "./contact.query.js";
import { contactRepository } from "./contact.repository.js";
import type { ListContactsQuery, UpdateContactBody } from "./contact.schemas.js";
import { buildProfileUpdate, diffProfile, normalizePatch } from "./contact.update.js";

export interface ContactPage {
  items: ContactLean[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function isDuplicateEmailError(error: unknown): boolean {
  return (
    error instanceof mongoose.mongo.MongoServerError &&
    error.code === 11000 &&
    error.keyPattern !== undefined &&
    "email" in error.keyPattern
  );
}

/** Business rules for contacts. Knows nothing about HTTP. */
export const contactService = {
  async getById(id: string): Promise<ContactLean> {
    const contact = await contactRepository.findById(id);
    if (!contact) throw errors.notFound("Contact");
    return contact;
  },

  /** A page past the end is not an error: it is an empty page with the real total. */
  async list(query: ListContactsQuery): Promise<ContactPage> {
    const { page, limit } = query;
    const { items, total } = await contactRepository.list({
      filter: buildListFilter(query),
      sort: buildListSort(query),
      skip: (page - 1) * limit,
      limit,
    });
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  },

  /**
   * Optimistic concurrency (ADR-003, docs/01-architecture.md §7.1).
   *
   * 1. Read the contact: 404 if missing, 409 if the client's version is already stale.
   * 2. Diff the normalized input against it; no real change → return it unchanged.
   * 3. In one transaction: the version-checked write (+1 version) and the
   *    CONTACT_UPDATED activity. If the write matches nothing, someone else
   *    wrote after step 1 → 409 (or 404 if the contact was deleted).
   *
   * Step 1's read is only for diffing and fast failure. Correctness comes from
   * step 3: the write itself requires the version to still match, so a change
   * slipping in between steps 1 and 3 can't be overwritten.
   */
  async update(id: string, body: UpdateContactBody): Promise<ContactLean> {
    const { version, ...fields } = body;

    const current = await contactRepository.findById(id);
    if (!current) throw errors.notFound("Contact");
    if (current.version !== version) throw errors.versionConflict(toContactDTO(current));

    const changes = diffProfile(current, normalizePatch(fields));
    if (changes.length === 0) return current; // no-op: no version bump, no activity

    try {
      return await runInTransaction(async (session) => {
        const updated = await contactRepository.updateIfVersion(
          id,
          version,
          buildProfileUpdate(current, changes),
          session,
        );
        if (!updated) {
          const latest = await contactRepository.findById(id, session);
          if (!latest) throw errors.notFound("Contact");
          throw errors.versionConflict(toContactDTO(latest));
        }
        await activityRepository.insert(
          { contactId: updated._id, type: "CONTACT_UPDATED", details: { changes } },
          session,
        );
        return updated;
      });
    } catch (error) {
      // The unique index is the source of truth for email uniqueness (ADR-004);
      // no "is this email taken?" pre-check, which would race.
      if (isDuplicateEmailError(error)) throw errors.duplicateEmail();
      throw error;
    }
  },
};
