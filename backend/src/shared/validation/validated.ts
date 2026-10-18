import type { Request, RequestHandler, Response } from "express";
import type { z } from "zod";
import { errors, type FieldErrors } from "../errors.js";

type Location = "params" | "query" | "body";
type RequestSchemas = Partial<Record<Location, z.ZodType>>;

/** The parsed, typed input a handler receives: one key per schema given. */
export type ValidatedInput<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

/**
 * Wraps a controller so it only ever sees validated, typed input.
 *
 *   export const getById = validated({ params: idParams }, async ({ params }, res) => { … });
 *
 * Why a wrapper instead of a middleware that overwrites req.query/req.body:
 * Express 5 makes `req.query` read-only, and a separate middleware can't pass
 * types to the handler. Here TypeScript infers `params.id` as a string from the schema.
 */
export function validated<S extends RequestSchemas>(
  schemas: S,
  handler: (input: ValidatedInput<S>, req: Request, res: Response) => Promise<void> | void,
): RequestHandler {
  return async (req, res) => {
    const input: Partial<Record<Location, unknown>> = {};
    const failures: Array<{ location: Location; issue: z.core.$ZodIssue }> = [];

    for (const location of ["params", "query", "body"] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location]);
      if (result.success) {
        input[location] = result.data;
      } else {
        for (const issue of result.error.issues) failures.push({ location, issue });
      }
    }

    if (failures.length > 0) throw toAppError(failures);
    // Express 5 forwards a rejected promise to the error middleware.
    await handler(input as ValidatedInput<S>, req, res);
  };
}

function toAppError(failures: Array<{ location: Location; issue: z.core.$ZodIssue }>) {
  // A malformed resource id makes everything else irrelevant: report it alone.
  if (failures.some(({ location, issue }) => location === "params" && issue.path[0] === "id")) {
    return errors.invalidId();
  }

  const fields: FieldErrors = {};
  const add = (key: string, message: string) => (fields[key] ??= []).push(message);

  for (const { location, issue } of failures) {
    // Body keys are unprefixed so they match form field names ("email");
    // query and params keys say where they came from ("query.limit").
    const prefix = location === "body" ? [] : [location];
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) add([...prefix, key].join("."), "Unknown field");
    } else {
      const key = [...prefix, ...issue.path.map(String)].join(".") || location;
      add(key, issue.message);
    }
  }
  return errors.validation(fields);
}
