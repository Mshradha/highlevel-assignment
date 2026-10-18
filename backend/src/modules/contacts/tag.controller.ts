import { idParamsSchema } from "../../shared/validation/schemas.js";
import { validated } from "../../shared/validation/validated.js";
import { toContactDTO } from "./contact.mapper.js";
import { addTagBodySchema, bulkTagBodySchema, tagParamsSchema } from "./contact.schemas.js";
import { tagService } from "./tag.service.js";

export const tagController = {
  add: validated(
    { params: idParamsSchema, body: addTagBodySchema },
    async ({ params, body }, _req, res) => {
      const { contact, changed } = await tagService.addTag(params.id, body.tag);
      res.status(200).json({ contact: toContactDTO(contact), changed });
    },
  ),

  remove: validated({ params: tagParamsSchema }, async ({ params }, _req, res) => {
    const { contact, changed } = await tagService.removeTag(params.id, params.tag);
    res.status(200).json({ contact: toContactDTO(contact), changed });
  }),

  bulkAdd: validated({ body: bulkTagBodySchema }, async ({ body }, _req, res) => {
    res.status(200).json(await tagService.bulkAddTag(body));
  }),
};
