import type { ListContactsParams, SortBy, SortOrder } from "../../../api/types";

/**
 * The list query lives in the URL (ADR-012): back button, refresh, and shared
 * links all restore the same view. These pure functions convert between the
 * URL and the API parameters. Anything invalid in the URL (hand-edited or an
 * old link) falls back to a default instead of producing an API error.
 */

export const PAGE_SIZE = 20;
const MAX_OFFSET = 10_000; // matches the backend limit
const MAX_PAGE = MAX_OFFSET / PAGE_SIZE + 1;
export const MIN_SEARCH_LENGTH = 2;
const TAG_PATTERN = /^[\p{L}\p{N} _-]{1,40}$/u;

export interface ListState {
  q: string;
  company: string;
  tags: string[];
  sortBy: SortBy;
  sortOrder: SortOrder;
  page: number;
}

export const defaultSortOrder = (sortBy: SortBy): SortOrder => (sortBy === "name" ? "asc" : "desc");

export const normalizeTagInput = (tag: string) =>
  tag.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

export function parseListState(search: URLSearchParams): ListState {
  const q = (search.get("q") ?? "").trim().slice(0, 100);
  const sortBy: SortBy = search.get("sortBy") === "name" ? "name" : "createdAt";
  const rawOrder = search.get("sortOrder");
  const sortOrder: SortOrder =
    rawOrder === "asc" || rawOrder === "desc" ? rawOrder : defaultSortOrder(sortBy);
  const page = Number(search.get("page"));
  const tags = [...new Set((search.get("tags") ?? "").split(",").map(normalizeTagInput))].filter(
    (t) => TAG_PATTERN.test(t),
  );

  return {
    q,
    company: (search.get("company") ?? "").trim().slice(0, 200),
    tags: tags.slice(0, 10),
    sortBy,
    sortOrder,
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** Writes only non-default values, so the plain list is just `/contacts`. */
export function serializeListState(state: ListState): URLSearchParams {
  const search = new URLSearchParams();
  if (state.q) search.set("q", state.q);
  if (state.company) search.set("company", state.company);
  if (state.tags.length > 0) search.set("tags", state.tags.join(","));
  if (state.sortBy !== "createdAt") search.set("sortBy", state.sortBy);
  if (state.sortOrder !== defaultSortOrder(state.sortBy)) search.set("sortOrder", state.sortOrder);
  if (state.page !== 1) search.set("page", String(state.page));
  return search;
}

/**
 * Applies a change. Any change to what is being searched, filtered, or sorted
 * goes back to page 1: page 4 of the old results means nothing for new ones.
 * Changing the sort field also resets the direction to that field's default.
 */
export function applyListChange(state: ListState, change: Partial<ListState>): ListState {
  const next = { ...state, ...change };
  if (change.sortBy !== undefined && change.sortBy !== state.sortBy && !change.sortOrder) {
    next.sortOrder = defaultSortOrder(change.sortBy);
  }
  const criteriaChanged = (["q", "company", "tags", "sortBy", "sortOrder"] as const).some(
    (k) => k in change && JSON.stringify(change[k]) !== JSON.stringify(state[k]),
  );
  if (criteriaChanged && change.page === undefined) next.page = 1;
  return next;
}

/** API parameters. A 1-character search isn't sent: the backend requires 2+. */
export function toApiParams(state: ListState): ListContactsParams {
  return {
    ...(state.q.length >= MIN_SEARCH_LENGTH && { q: state.q }),
    ...(state.company && { company: state.company }),
    ...(state.tags.length > 0 && { tags: state.tags }),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    page: state.page,
    limit: PAGE_SIZE,
  };
}
