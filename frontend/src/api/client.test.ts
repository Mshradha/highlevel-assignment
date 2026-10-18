import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, buildQuery, isAbortError } from "./client";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Runs a request that must fail and returns the ApiError. */
async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("buildQuery", () => {
  it("omits empty values and joins arrays with commas", () => {
    expect(
      buildQuery({
        q: "ann",
        company: "",
        tags: ["vip", "lead"],
        page: 2,
        sortBy: undefined,
        x: [],
      }),
    ).toBe("?q=ann&tags=vip%2Clead&page=2");
  });

  it("returns an empty string when nothing is set", () => {
    expect(buildQuery({ q: undefined, tags: [] })).toBe("");
  });
});

describe("apiRequest — success", () => {
  it("prefixes /api, adds the query string, and returns the parsed JSON", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));

    await expect(apiRequest("/contacts", { query: { q: "ann" } })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/contacts?q=ann");
  });

  it("sends a JSON body with a Content-Type only when there is a body", async () => {
    fetchMock.mockResolvedValue(json({}));
    await apiRequest("/contacts/1", { method: "PATCH", body: { version: 1 } });
    await apiRequest("/contacts/1");

    const [, patchInit] = fetchMock.mock.calls[0]!;
    expect(patchInit).toMatchObject({ method: "PATCH", body: '{"version":1}' });
    expect(patchInit?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).not.toHaveProperty("Content-Type");
  });
});

describe("apiRequest — failures", () => {
  it("turns the API's error body into an ApiError with status, code, message, and details", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: "NOT_FOUND", message: "Contact not found" } }, 404),
    );
    const error = await failure(apiRequest("/contacts/x"));
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND", message: "Contact not found" });
  });

  it("reports a non-JSON error response (e.g. a proxy page) as UNEXPECTED_RESPONSE", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const error = await failure(apiRequest("/contacts"));
    expect(error).toMatchObject({ status: 502, code: "UNEXPECTED_RESPONSE" });
  });

  it("reports a request that never got a response as NETWORK_ERROR with status 0", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const error = await failure(apiRequest("/contacts"));
    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("rethrows cancellations unchanged so callers can ignore them", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );

    const pending = apiRequest("/contacts", { signal: controller.signal });
    controller.abort();
    const error = await pending.catch((e: unknown) => e);

    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe("ApiError helpers", () => {
  it("fieldErrors() returns the first message per body field and skips query/params fields", () => {
    const error = new ApiError(400, "VALIDATION_ERROR", "Request validation failed", {
      fields: { email: ["Invalid email", "Too long"], "query.limit": ["Too big"] },
    });
    expect(error.fieldErrors()).toEqual({ email: "Invalid email" });
  });

  it("fieldErrors() puts a duplicate-email error on the email field", () => {
    const error = new ApiError(409, "DUPLICATE_EMAIL", "Another contact already uses this email");
    expect(error.fieldErrors()).toEqual({ email: "Another contact already uses this email" });
  });

  it("conflictCurrent() returns the server's latest contact only for VERSION_CONFLICT", () => {
    const current = { id: "1", version: 2 };
    expect(new ApiError(409, "VERSION_CONFLICT", "", { current }).conflictCurrent()).toEqual(
      current,
    );
    expect(new ApiError(404, "NOT_FOUND", "").conflictCurrent()).toBeUndefined();
  });
});
