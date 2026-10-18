import { errors } from "../../shared/errors.js";
import { contactRepository } from "../contacts/contact.repository.js";
import { type ActivityLean, activityRepository } from "./activity.repository.js";

export const activityService = {
  /** 404 for an unknown contact, so "no history" and "no such contact" are distinguishable. */
  async listRecent(contactId: string, limit: number): Promise<ActivityLean[]> {
    const contact = await contactRepository.findById(contactId);
    if (!contact) throw errors.notFound("Contact");
    return activityRepository.listForContact(contactId, limit);
  },
};
