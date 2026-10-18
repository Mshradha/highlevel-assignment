import { errors } from "../../shared/errors.js";
import type { ContactLean } from "./contact.mapper.js";
import { buildListFilter, buildListSort } from "./contact.query.js";
import { contactRepository } from "./contact.repository.js";
import type { ListContactsQuery } from "./contact.schemas.js";

export interface ContactPage {
  items: ContactLean[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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
};
