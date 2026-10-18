import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { describeError } from "./errors";
import { contactName } from "./format";

describe("describeError", () => {
  it.each([
    ["NETWORK_ERROR", "Can't reach the server"],
    ["INTERNAL_ERROR", "Something went wrong on our side"],
    ["UNEXPECTED_RESPONSE", "Something went wrong on our side"],
    ["NOT_FOUND", "doesn't exist"],
  ] as const)("gives a friendly message for %s", (code, expected) => {
    expect(describeError(new ApiError(500, code, "raw server text"))).toContain(expected);
  });

  it("uses the API's own message for other codes", () => {
    expect(describeError(new ApiError(503, "QUERY_TIMEOUT", "The search took too long"))).toBe(
      "The search took too long",
    );
  });

  it("never shows internals of non-API errors", () => {
    expect(describeError(new Error("TypeError: x is undefined"))).toBe(
      "Something unexpected happened. Please try again.",
    );
  });
});

describe("contactName", () => {
  it("joins first and last name, or uses the first name alone", () => {
    expect(contactName({ firstName: "Ann", lastName: "Lee" })).toBe("Ann Lee");
    expect(contactName({ firstName: "Bob", lastName: null })).toBe("Bob");
  });
});
