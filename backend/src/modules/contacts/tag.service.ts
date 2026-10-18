import { randomUUID } from "node:crypto";
import { errors } from "../../shared/errors.js";
import { runInTransaction } from "../../shared/transaction.js";
import { activityRepository } from "../activities/activity.repository.js";
import { CONTACT_LIMITS } from "./contact.constants.js";
import type { ContactLean } from "./contact.mapper.js";
import { contactRepository } from "./contact.repository.js";
import type { BulkTagBody } from "./contact.schemas.js";

export interface TagChangeResult {
  contact: ContactLean;
  /** false when the request was a no-op (tag already present / already absent). */
  changed: boolean;
}

export interface BulkTagResult {
  tag: string;
  requested: number;
  modified: number;
  alreadyTagged: number;
  skippedTagLimit: number;
  notFound: string[];
}

/**
 * Tag rules (ADR-007): tags are normalized lowercase strings; adding a tag a
 * contact already has, or removing one it doesn't have, succeeds without
 * changing anything (safe to retry) and records no activity. A change and its
 * activity are written in one transaction.
 */
export const tagService = {
  async addTag(id: string, tag: string): Promise<TagChangeResult> {
    return runInTransaction(async (session) => {
      const updated = await contactRepository.addTagIfAbsent(id, tag, session);
      if (updated) {
        await activityRepository.insert(
          { contactId: updated._id, type: "TAG_ADDED", details: { tag } },
          session,
        );
        return { contact: updated, changed: true };
      }
      // Nothing matched: find out why.
      const current = await contactRepository.findById(id, session);
      if (!current) throw errors.notFound("Contact");
      if (current.tags.includes(tag)) return { contact: current, changed: false };
      throw errors.tagLimit(CONTACT_LIMITS.tagsPerContactMax);
    });
  },

  async removeTag(id: string, tag: string): Promise<TagChangeResult> {
    return runInTransaction(async (session) => {
      const updated = await contactRepository.removeTagIfPresent(id, tag, session);
      if (updated) {
        await activityRepository.insert(
          { contactId: updated._id, type: "TAG_REMOVED", details: { tag } },
          session,
        );
        return { contact: updated, changed: true };
      }
      const current = await contactRepository.findById(id, session);
      if (!current) throw errors.notFound("Contact");
      return { contact: current, changed: false };
    });
  },

  /**
   * One transaction for the whole batch (ADR-009):
   *   1. read the selected contacts and sort them into
   *      eligible / already tagged / at the tag limit / not found;
   *   2. add the tag to the eligible ones;
   *   3. record one TAG_ADDED per contact that actually changed.
   *
   * Every read and write in the transaction sees the same snapshot. If another
   * request changes one of these contacts meanwhile, MongoDB reports a write
   * conflict and the whole callback is retried from step 1, so the activities
   * always match the contacts that really changed. Contacts that are missing,
   * already tagged, or full are reported, not treated as errors.
   */
  async bulkAddTag({ contactIds, tag }: BulkTagBody): Promise<BulkTagResult> {
    const bulkOperationId = randomUUID();

    return runInTransaction(async (session) => {
      const found = await contactRepository.findTagsByIds(contactIds, session);
      const foundIds = new Set(found.map((c) => c._id.toHexString()));

      const alreadyTagged = found.filter((c) => c.tags.includes(tag));
      const atLimit = found.filter(
        (c) => !c.tags.includes(tag) && c.tags.length >= CONTACT_LIMITS.tagsPerContactMax,
      );
      const eligible = found.filter(
        (c) => !c.tags.includes(tag) && c.tags.length < CONTACT_LIMITS.tagsPerContactMax,
      );

      const modified = await contactRepository.addTagToMany(
        eligible.map((c) => c._id),
        tag,
        session,
      );
      // Same snapshot as the read above, so these must agree. If they ever
      // don't, abort rather than record activities that don't match reality.
      if (modified !== eligible.length) {
        throw new Error(`bulk tag: expected ${eligible.length} updates, got ${modified}`);
      }

      await activityRepository.insertMany(
        eligible.map((c) => ({
          contactId: c._id,
          type: "TAG_ADDED" as const,
          details: { tag, bulkOperationId },
        })),
        session,
      );

      return {
        tag,
        requested: contactIds.length,
        modified,
        alreadyTagged: alreadyTagged.length,
        skippedTagLimit: atLimit.length,
        notFound: contactIds.filter((id) => !foundIds.has(id)),
      };
    });
  },
};
