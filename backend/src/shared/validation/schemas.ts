import { isValidObjectId } from "mongoose";
import { z } from "zod";

/**
 * A 24-character hex ObjectId. `isValidObjectId` alone also accepts any
 * 12-character string, so the pattern check comes first.
 */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "must be a valid id")
  .refine((value) => isValidObjectId(value), "must be a valid id");

export const idParamsSchema = z.object({ id: objectIdSchema });
