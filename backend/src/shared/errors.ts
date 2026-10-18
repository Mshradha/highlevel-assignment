/**
 * Every error code the API can return. Clients switch on `code`, never on
 * `message` (messages are for humans and may change).
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR", // 400: input has the wrong shape, type, or length
  "INVALID_ID", // 400: a path :id is not a valid ObjectId
  "INVALID_JSON", // 400: body is not parseable JSON
  "PAYLOAD_TOO_LARGE", // 413: body over the size limit
  "ROUTE_NOT_FOUND", // 404: no such endpoint
  "NOT_FOUND", // 404: valid id, but no such resource
  "VERSION_CONFLICT", // 409: stale version (optimistic concurrency)
  "DUPLICATE_EMAIL", // 409: email belongs to another contact
  "TAG_LIMIT_EXCEEDED", // 422: valid request that breaks a business rule
  "INTERNAL_ERROR", // 500: unexpected; details only in server logs
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * An expected failure with a known HTTP status and a stable, machine-readable code.
 * Services throw it; the error middleware turns it into the JSON error response.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Field path → messages, e.g. { "email": ["Invalid email"], "query.limit": ["Too big"] } */
export type FieldErrors = Record<string, string[]>;

export const errors = {
  validation: (fields: FieldErrors) =>
    new AppError(400, "VALIDATION_ERROR", "Request validation failed", { fields }),
  invalidId: () => new AppError(400, "INVALID_ID", "The id in the URL is not a valid id"),
  notFound: (resource: string) => new AppError(404, "NOT_FOUND", `${resource} not found`),
  duplicateEmail: () =>
    new AppError(409, "DUPLICATE_EMAIL", "Another contact already uses this email", {
      field: "email",
    }),
};
