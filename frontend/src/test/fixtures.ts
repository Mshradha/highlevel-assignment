import type { Activity, Contact, ContactPage } from "../api/types";

let counter = 0;

export function makeContact(overrides: Partial<Contact> = {}): Contact {
  counter += 1;
  return {
    id: `c${counter.toString().padStart(23, "0")}`,
    firstName: "Ann",
    lastName: "Lee",
    email: `ann${counter}@example.com`,
    phone: null,
    company: "Acme",
    tags: [],
    version: 1,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

export function makePage(contacts: Contact[], page = 1, total = contacts.length): ContactPage {
  return {
    data: contacts,
    pagination: { page, limit: 20, total, totalPages: Math.ceil(total / 20) },
  };
}

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  counter += 1;
  return {
    id: `a${counter}`,
    contactId: "c1",
    type: "TAG_ADDED",
    createdAt: "2026-01-02T10:00:00.000Z",
    details: { tag: "vip" },
    ...overrides,
  };
}
