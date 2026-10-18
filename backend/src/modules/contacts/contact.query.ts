import type { QueryFilter } from "mongoose";
import type { ContactRecord } from "./contact.model.js";
import { normalizeOptionalText, toPhoneDigits } from "./contact.normalize.js";
import type { ListContactsQuery } from "./contact.schemas.js";

/** Makes user text safe to embed in a regex: every special character is literal. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Only digits and phone punctuation, with enough digits to be a useful phone search. */
function asPhoneSearch(q: string): string | undefined {
  if (!/^[\d\s()+.-]+$/.test(q)) return undefined;
  const digits = toPhoneDigits(q);
  return digits.length >= 3 ? digits : undefined;
}

/**
 * Builds the MongoDB filter for the contact list.
 *
 * Search is a case-insensitive PREFIX match on lowercase copies of the fields
 * (ADR-005). An anchored regex (`^ann`) on an indexed field becomes an index
 * range scan; an unanchored or /i regex would read every document.
 */
export function buildListFilter({
  q,
  company,
  tags,
}: Pick<ListContactsQuery, "q" | "company" | "tags">): QueryFilter<ContactRecord> {
  const conditions: QueryFilter<ContactRecord>[] = [];

  if (q) {
    const prefix = new RegExp(`^${escapeRegex(normalizeOptionalText(q)!.toLowerCase())}`);
    // email and phoneDigits have PARTIAL indexes ({ $type: "string" }). MongoDB
    // only uses a partial index when the query provably matches its filter, and
    // it can't infer that from a regex alone — so each branch repeats the filter.
    // Without it, an $or branch has no usable index, the planner can't combine
    // the branch indexes, and a rare search scans the whole collection
    // (measured on 100k contacts: 100,000 keys read → 13; see docs/performance.md).
    const anyOf: QueryFilter<ContactRecord>[] = [
      { fullNameLower: prefix }, // "ann", "ann lee"
      { lastNameLower: prefix }, // "lee"
      { email: { $type: "string", $regex: prefix } }, // "ann.lee@"
    ];
    const phoneDigits = asPhoneSearch(q);
    if (phoneDigits) {
      anyOf.push({ phoneDigits: { $type: "string", $regex: new RegExp(`^${phoneDigits}`) } });
    }
    conditions.push({ $or: anyOf });
  }

  if (company) {
    conditions.push({ companyLower: normalizeOptionalText(company)!.toLowerCase() });
  }

  if (tags && tags.length > 0) {
    conditions.push({ tags: { $all: tags } }); // the contact must have every selected tag
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0]!;
  return { $and: conditions };
}

export type ListSort = Record<string, 1 | -1>;

/**
 * Sort keys match the compound indexes exactly, and always end with `_id`, so
 * the order is total: equal names or dates never swap between requests and
 * no row appears on two pages. Descending reuses the same index backwards.
 */
export function buildListSort({
  sortBy,
  sortOrder,
}: Pick<ListContactsQuery, "sortBy" | "sortOrder">): ListSort {
  const dir = sortOrder === "asc" ? 1 : -1;
  return sortBy === "name"
    ? { lastNameLower: dir, firstNameLower: dir, _id: dir }
    : { createdAt: dir, _id: dir };
}
