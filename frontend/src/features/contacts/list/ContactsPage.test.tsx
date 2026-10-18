import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/client";
import * as api from "../../../api/contacts";
import { App } from "../../../App";
import { makeContact, makePage } from "../../../test/fixtures";

vi.mock("../../../api/contacts");
const getContacts = vi.mocked(api.getContacts);
const bulkAssignTag = vi.mocked(api.bulkAssignTag);

const ann = makeContact({ firstName: "Ann", lastName: "Lee", tags: ["vip"] });
const bob = makeContact({ firstName: "Bob", lastName: "Stone", company: null });

function renderAt(url = "/contacts") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );
}

/** The params of the most recent list request. */
const lastParams = () => getContacts.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.resetAllMocks();
  getContacts.mockResolvedValue(makePage([ann, bob]));
});

describe("ContactsPage — loading, results, empty, error", () => {
  it("shows a loading state, then the contacts and the result count", async () => {
    renderAt();
    // (The page also keeps an empty status region for bulk-tag messages, so find by text.)
    expect(screen.getByText("Loading contacts…").closest("[role=status]")).toBeInTheDocument();

    expect(await screen.findByRole("link", { name: "Ann Lee" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bob Stone" })).toBeInTheDocument();
    expect(screen.getByText("Showing 1–2 of 2")).toBeInTheDocument();
  });

  it("distinguishes 'no contacts yet' from 'nothing matches'", async () => {
    getContacts.mockResolvedValue(makePage([]));
    const { unmount } = renderAt();
    expect(await screen.findByText("No contacts yet")).toBeInTheDocument();
    unmount();

    renderAt("/contacts?q=zzz");
    expect(await screen.findByText("No contacts match")).toBeInTheDocument();
  });

  it("clears filters from the empty state", async () => {
    getContacts.mockResolvedValueOnce(makePage([]));
    renderAt("/contacts?q=zzz&tags=vip");
    const empty = await screen.findByText("No contacts match");

    await userEvent.click(
      within(empty.parentElement!).getByRole("button", { name: "Clear filters" }),
    );
    await waitFor(() => expect(lastParams()).not.toHaveProperty("q"));
    expect(lastParams()).not.toHaveProperty("tags");
    expect(screen.getByRole("searchbox")).toHaveValue(""); // the box follows the URL
  });

  it("shows an error with a working retry", async () => {
    getContacts.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "offline"));
    renderAt();

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Ann Lee" })).toBeInTheDocument();
  });

  it("offers the last page when the URL points past the end", async () => {
    getContacts.mockResolvedValue({
      data: [],
      pagination: { page: 9, limit: 20, total: 30, totalPages: 2 },
    });
    renderAt("/contacts?page=9");
    await userEvent.click(await screen.findByRole("button", { name: /Go to the last page/ }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
  });
});

describe("ContactsPage — search, filters, sorting, pagination", () => {
  it("debounces search and never sends a 1-character query", async () => {
    renderAt();
    await screen.findByRole("link", { name: "Ann Lee" });
    const box = screen.getByRole("searchbox");

    await userEvent.type(box, "a");
    expect(screen.getByText("Type at least 2 characters")).toBeInTheDocument();

    await userEvent.type(box, "nn");
    await waitFor(() => expect(lastParams()).toMatchObject({ q: "ann", page: 1 }));
    const searches = getContacts.mock.calls.filter(([params]) => params.q !== undefined);
    expect(searches.map(([p]) => p.q)).toEqual(["ann"]); // one request, after typing paused
  });

  it("adds a tag filter (normalized) and goes back to page 1", async () => {
    renderAt("/contacts?page=3");
    await screen.findByRole("link", { name: "Ann Lee" });

    await userEvent.type(screen.getByLabelText("Has tags"), "  VIP {Enter}");
    await waitFor(() => expect(lastParams()).toMatchObject({ tags: ["vip"], page: 1 }));
    expect(screen.getByRole("button", { name: "Remove tag vip" })).toBeInTheDocument();
  });

  it("applies the company filter on Enter, not on every keystroke", async () => {
    renderAt();
    await screen.findByRole("link", { name: "Ann Lee" });
    const callsBefore = getContacts.mock.calls.length;

    await userEvent.type(screen.getByLabelText("Company"), "Acme");
    expect(getContacts.mock.calls.length).toBe(callsBefore);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(lastParams()).toMatchObject({ company: "Acme" }));
  });

  it("sorts by name", async () => {
    renderAt();
    await screen.findByRole("link", { name: "Ann Lee" });
    await userEvent.selectOptions(screen.getByLabelText("Sort"), "Name A → Z");
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: "name", sortOrder: "asc" }));
  });

  it("goes to the next page, keeping the other parameters", async () => {
    getContacts.mockResolvedValue(makePage([ann, bob], 1, 45));
    renderAt("/contacts?q=ann");
    await screen.findByText("Showing 1–20 of 45");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ q: "ann", page: 2 }));
  });
});

describe("ContactsPage — selection and bulk tagging", () => {
  it("assigns a tag to the selected contacts, reports the result, and refreshes", async () => {
    bulkAssignTag.mockResolvedValue({
      tag: "partner",
      requested: 2,
      modified: 1,
      alreadyTagged: 1,
      skippedTagLimit: 0,
      notFound: [],
    });
    renderAt();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Ann Lee" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Bob Stone" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    const callsBefore = getContacts.mock.calls.length;
    await userEvent.type(screen.getByLabelText("Tag to add to the selected contacts"), " Partner");
    await userEvent.click(screen.getByRole("button", { name: "Add tag to 2" }));

    expect(bulkAssignTag).toHaveBeenCalledWith([ann.id, bob.id], "partner");
    expect(
      await screen.findByText(/Added “partner” to 1 contact\. 1 already had it\./),
    ).toBeInTheDocument();
    expect(screen.queryByText("2 selected")).not.toBeInTheDocument(); // selection cleared
    await waitFor(() => expect(getContacts.mock.calls.length).toBe(callsBefore + 1)); // refreshed
  });

  it("keeps the selection and shows the error when bulk tagging fails", async () => {
    bulkAssignTag.mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "boom"));
    renderAt();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Ann Lee" }));
    await userEvent.type(
      screen.getByLabelText("Tag to add to the selected contacts"),
      "vip{Enter}",
    );

    expect(await screen.findByText(/Something went wrong on our side/)).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("selects every contact on the page with the header checkbox", async () => {
    renderAt();
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select all contacts on this page" }),
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("clears the selection when the search changes, so hidden contacts can't be tagged", async () => {
    renderAt();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Ann Lee" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox"), "bo");
    await waitFor(() => expect(lastParams()).toMatchObject({ q: "bo" }));
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
  });
});
