import { getContactActivities, getContactById, getContacts } from "../api/contacts";
import type { ListContactsParams } from "../api/types";
import { useApiRequest } from "./useApiRequest";

/**
 * One hook per kind of server data. The key says what identifies the data:
 * the same key means the same request, a new key aborts the old request.
 */

export function useContactList(params: ListContactsParams) {
  return useApiRequest(`contacts:${JSON.stringify(params)}`, (signal) =>
    getContacts(params, signal),
  );
}

export function useContact(id: string) {
  return useApiRequest(`contact:${id}`, (signal) => getContactById(id, signal));
}

export function useActivities(contactId: string, limit = 20) {
  return useApiRequest(`activities:${contactId}:${limit}`, (signal) =>
    getContactActivities(contactId, limit, signal),
  );
}
