/**
 * Types for the backend's JSON API (docs/01-architecture.md §6).
 *
 * These mirror the backend DTOs by hand (ADR-001: no shared package). If the
 * backend contract changes, update this file; the end-to-end tests catch drift.
 */

export interface Contact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: string[];
  version: number;
  createdAt: string; // ISO 8601, UTC
  updatedAt: string;
}

export type EditableContactField = "firstName" | "lastName" | "email" | "phone" | "company";

export interface FieldChange {
  field: EditableContactField;
  from: string | null;
  to: string | null;
}

export type ActivityType = "CONTACT_UPDATED" | "TAG_ADDED" | "TAG_REMOVED";

export interface Activity {
  id: string;
  contactId: string;
  type: ActivityType;
  createdAt: string;
  details: {
    changes?: FieldChange[];
    tag?: string;
    bulkOperationId?: string;
  };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ContactPage {
  data: Contact[];
  pagination: Pagination;
}

export type SortBy = "name" | "createdAt";
export type SortOrder = "asc" | "desc";

export interface ListContactsParams {
  q?: string;
  company?: string;
  tags?: string[];
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
}

/** PATCH body: `version` is required; `null` or "" clears an optional field. */
export interface UpdateContactInput {
  version: number;
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}

export interface TagChangeResult {
  contact: Contact;
  /** false when nothing changed (tag already present / already absent). */
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

/** Codes the backend returns, plus two the client creates itself. */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_ID"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "ROUTE_NOT_FOUND"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "DUPLICATE_EMAIL"
  | "TAG_LIMIT_EXCEEDED"
  | "QUERY_TIMEOUT"
  | "INTERNAL_ERROR"
  // client-side only:
  | "NETWORK_ERROR" // the request never got a response
  | "UNEXPECTED_RESPONSE"; // a response that isn't our JSON error format (e.g. a proxy page)

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}
