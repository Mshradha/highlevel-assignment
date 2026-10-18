import { ApiError } from "../api/client";

/** A message suitable for showing to a user, for any thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NETWORK_ERROR":
        return "Can't reach the server. Check your connection and try again.";
      case "INTERNAL_ERROR":
      case "UNEXPECTED_RESPONSE":
        return "Something went wrong on our side. Please try again.";
      case "NOT_FOUND":
        return "This contact doesn't exist or was deleted.";
      default:
        return error.message; // the API's messages are written for people
    }
  }
  return "Something unexpected happened. Please try again.";
}
