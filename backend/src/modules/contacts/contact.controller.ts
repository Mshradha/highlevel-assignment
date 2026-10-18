import { idParamsSchema } from "../../shared/validation/schemas.js";
import { validated } from "../../shared/validation/validated.js";
import { toContactDTO } from "./contact.mapper.js";
import { contactService } from "./contact.service.js";

/**
 * Controllers translate HTTP to service calls and back: take validated input,
 * call one service function, choose the status, map to the DTO.
 */
export const contactController = {
  getById: validated({ params: idParamsSchema }, async ({ params }, _req, res) => {
    const contact = await contactService.getById(params.id);
    res.status(200).json(toContactDTO(contact));
  }),
};
