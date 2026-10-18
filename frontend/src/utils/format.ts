import type { Contact } from "../api/types";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** The API sends UTC ISO strings; these show them in the viewer's time zone. */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

export function contactName(contact: Pick<Contact, "firstName" | "lastName">): string {
  return contact.lastName ? `${contact.firstName} ${contact.lastName}` : contact.firstName;
}
