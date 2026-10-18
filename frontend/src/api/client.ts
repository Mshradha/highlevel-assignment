import type { ApiErrorBody, ApiErrorCode, Contact } from "./types";

/**
 * Every failed request becomes an ApiError, whatever went wrong — an error
 * response from our API, a non-JSON response (e.g. a proxy error page), or no
 * response at all. Components switch on `code`, never on `message`.
 */
export class ApiError extends Error {
  readonly status: number; // 0 when there was no response
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /**
   * Server-side field errors as `field → first message`, for showing next to
   * form inputs. Only body fields are included (keys without a "query." or
   * "params." prefix), since those are the ones a form can display.
   */
  fieldErrors(): Record<string, string> {
    if (this.code === "DUPLICATE_EMAIL") return { email: this.message };
    if (this.code !== "VALIDATION_ERROR") return {};
    const fields = (this.details as { fields?: Record<string, string[]> } | undefined)?.fields;
    const result: Record<string, string> = {};
    for (const [key, messages] of Object.entries(fields ?? {})) {
      if (!key.includes(".") && messages[0]) result[key] = messages[0];
    }
    return result;
  }

  /** For VERSION_CONFLICT: the contact as it is now on the server. */
  conflictCurrent(): Contact | undefined {
    if (this.code !== "VERSION_CONFLICT") return undefined;
    return (this.details as { current?: Contact } | undefined)?.current;
  }
}

/** True when a request was cancelled on purpose (AbortController); not an error to show. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// Relative by default: the Vite dev server proxies /api to the backend.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export type QueryValue = string | number | string[] | undefined;

/** Omits empty values; arrays become comma-separated (`tags=vip,lead`). */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(","));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const { error } = value as { error: unknown };
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, signal } = options;
  const url = `${BASE_URL}/api${path}${query ? buildQuery(query) : ""}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (isAbortError(error)) throw error; // let callers ignore cancelled requests
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection.");
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (response.ok) return payload as T;
  if (isApiErrorBody(payload)) {
    const { code, message, details } = payload.error;
    throw new ApiError(response.status, code, message, details);
  }
  throw new ApiError(
    response.status,
    "UNEXPECTED_RESPONSE",
    `The server returned an unexpected response (HTTP ${response.status}).`,
  );
}
