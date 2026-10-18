import { errors } from "../../shared/errors.js";
import type { ContactLean } from "./contact.mapper.js";
import { contactRepository } from "./contact.repository.js";

/** Business rules for contacts. Knows nothing about HTTP. */
export const contactService = {
  async getById(id: string): Promise<ContactLean> {
    const contact = await contactRepository.findById(id);
    if (!contact) throw errors.notFound("Contact");
    return contact;
  },
};
