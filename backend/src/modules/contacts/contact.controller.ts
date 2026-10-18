import { idParamsSchema } from "../../shared/validation/schemas.js";
import { validated } from "../../shared/validation/validated.js";
import { toContactDTO } from "./contact.mapper.js";
import { listContactsQuerySchema, updateContactBodySchema } from "./contact.schemas.js";
import { contactService } from "./contact.service.js";

/**
 * Controllers translate HTTP to service calls and back: take validated input,
 * call one service function, choose the status, map to the DTO.
 */
export const contactController = {
  list: validated({ query: listContactsQuerySchema }, async ({ query }, _req, res) => {
    const result = await contactService.list(query);
    res.status(200).json({
      data: result.items.map(toContactDTO),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  }),

  getById: validated({ params: idParamsSchema }, async ({ params }, _req, res) => {
    const contact = await contactService.getById(params.id);
    res.status(200).json(toContactDTO(contact));
  }),

  update: validated(
    { params: idParamsSchema, body: updateContactBodySchema },
    async ({ params, body }, _req, res) => {
      const contact = await contactService.update(params.id, body);
      res.status(200).json(toContactDTO(contact));
    },
  ),
};
