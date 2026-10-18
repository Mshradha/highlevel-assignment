import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addTag,
  bulkAssignTag,
  getContactActivities,
  getContacts,
  removeTag,
  updateContact,
} from "./contacts";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: [] })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return {
    url,
    method: init?.method,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
};

describe("contact service functions", () => {
  it("getContacts sends list parameters as a query string", async () => {
    await getContacts({ q: "ann", tags: ["vip"], sortBy: "name", page: 2, company: "" });
    expect(lastCall().url).toBe("/api/contacts?q=ann&tags=vip&sortBy=name&page=2");
  });

  it("updateContact sends PATCH with the version and changes", async () => {
    await updateContact("abc", { version: 3, company: null });
    expect(lastCall()).toEqual({
      url: "/api/contacts/abc",
      method: "PATCH",
      body: { version: 3, company: null },
    });
  });

  it("addTag and removeTag hit the tag endpoints, encoding the tag in the URL", async () => {
    await addTag("abc", "churn risk");
    expect(lastCall()).toEqual({
      url: "/api/contacts/abc/tags",
      method: "POST",
      body: { tag: "churn risk" },
    });

    await removeTag("abc", "churn risk");
    expect(lastCall()).toMatchObject({
      url: "/api/contacts/abc/tags/churn%20risk",
      method: "DELETE",
    });
  });

  it("bulkAssignTag posts the selected ids and the tag", async () => {
    await bulkAssignTag(["a", "b"], "vip");
    expect(lastCall()).toEqual({
      url: "/api/contacts/bulk-tags",
      method: "POST",
      body: { contactIds: ["a", "b"], tag: "vip" },
    });
  });

  it("getContactActivities returns the data array and passes the limit", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "a1" }] })));
    await expect(getContactActivities("abc", 5)).resolves.toEqual([{ id: "a1" }]);
    expect(lastCall().url).toBe("/api/contacts/abc/activities?limit=5");
  });
});
