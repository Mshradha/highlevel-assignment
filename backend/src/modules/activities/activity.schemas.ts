import { z } from "zod";

export const listActivitiesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
