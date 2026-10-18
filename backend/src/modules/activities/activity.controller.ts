import { idParamsSchema } from "../../shared/validation/schemas.js";
import { validated } from "../../shared/validation/validated.js";
import { listActivitiesQuerySchema } from "./activity.schemas.js";
import { toActivityDTO } from "./activity.mapper.js";
import { activityService } from "./activity.service.js";

export const activityController = {
  listForContact: validated(
    { params: idParamsSchema, query: listActivitiesQuerySchema },
    async ({ params, query }, _req, res) => {
      const activities = await activityService.listRecent(params.id, query.limit);
      res.status(200).json({ data: activities.map(toActivityDTO) });
    },
  ),
};
