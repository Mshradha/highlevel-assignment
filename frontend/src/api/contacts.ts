import { apiRequest } from "./client";
import type {
  Activity,
  BulkTagResult,
  Contact,
  ContactPage,
  ListContactsParams,
  TagChangeResult,
  UpdateContactInput,
} from "./types";

/**
 * One typed function per endpoint. Components and hooks call these; nothing
 * else in the app builds URLs or calls fetch. Every function accepts an
 * AbortSignal so a request can be cancelled when it's no longer needed.
 */

export function getContacts(params: ListContactsParams, signal?: AbortSignal) {
  return apiRequest<ContactPage>("/contacts", { query: { ...params }, signal });
}

export function getContactById(id: string, signal?: AbortSignal) {
  return apiRequest<Contact>(`/contacts/${encodeURIComponent(id)}`, { signal });
}

export function updateContact(id: string, input: UpdateContactInput, signal?: AbortSignal) {
  return apiRequest<Contact>(`/contacts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
    signal,
  });
}

export function addTag(id: string, tag: string, signal?: AbortSignal) {
  return apiRequest<TagChangeResult>(`/contacts/${encodeURIComponent(id)}/tags`, {
    method: "POST",
    body: { tag },
    signal,
  });
}

export function removeTag(id: string, tag: string, signal?: AbortSignal) {
  return apiRequest<TagChangeResult>(
    `/contacts/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`,
    { method: "DELETE", signal },
  );
}

export function bulkAssignTag(contactIds: string[], tag: string, signal?: AbortSignal) {
  return apiRequest<BulkTagResult>("/contacts/bulk-tags", {
    method: "POST",
    body: { contactIds, tag },
    signal,
  });
}

export async function getContactActivities(id: string, limit = 20, signal?: AbortSignal) {
  const result = await apiRequest<{ data: Activity[] }>(
    `/contacts/${encodeURIComponent(id)}/activities`,
    { query: { limit }, signal },
  );
  return result.data;
}
