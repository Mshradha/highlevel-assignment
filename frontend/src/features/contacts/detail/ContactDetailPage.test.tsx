import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/client";
import * as api from "../../../api/contacts";
import { App } from "../../../App";
import { makeActivity, makeContact } from "../../../test/fixtures";

vi.mock("../../../api/contacts");
const getContactById = vi.mocked(api.getContactById);
const getContactActivities = vi.mocked(api.getContactActivities);
const updateContact = vi.mocked(api.updateContact);
const addTag = vi.mocked(api.addTag);
const removeTag = vi.mocked(api.removeTag);

const v1 = makeContact({
  id: "c1",
  firstName: "Ann",
  lastName: "Lee",
  email: "ann@example.com",
  company: "Acme",
  tags: ["vip"],
});

async function renderDetail() {
  render(
    <MemoryRouter initialEntries={[`/contacts/${v1.id}`]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1, name: "Ann Lee" });
}

const field = (label: string) => screen.getByLabelText(label);
const saveButton = () => screen.getByRole("button", { name: "Save changes" });

async function retype(label: string, value: string) {
  await userEvent.clear(field(label));
  if (value) await userEvent.type(field(label), value);
}

beforeEach(() => {
  vi.resetAllMocks();
  getContactById.mockResolvedValue(v1);
  getContactActivities.mockResolvedValue([]);
});

describe("ContactDetailPage — loading and missing contacts", () => {
  it("shows the contact with Save disabled until something changes", async () => {
    await renderDetail();
    expect(field("Email")).toHaveValue("ann@example.com");
    expect(saveButton()).toBeDisabled();

    await retype("Company", "Globex");
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText("Unsaved changes: Company")).toBeInTheDocument();
  });

  it("shows 'Contact not found' without a retry for a missing contact", async () => {
    getContactById.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Contact not found"));
    render(
      <MemoryRouter initialEntries={["/contacts/nope"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Contact not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("ContactDetailPage — editing", () => {
  it("blocks invalid input in the browser without calling the API", async () => {
    await renderDetail();
    await retype("Email", "not-an-email");
    await userEvent.click(saveButton());

    expect(field("Email")).toHaveAccessibleDescription("Enter a valid email address");
    expect(field("Email")).toHaveAttribute("aria-invalid", "true");
    expect(updateContact).not.toHaveBeenCalled();
  });

  it("saves only the changed fields with the loaded version, then refreshes the activity", async () => {
    updateContact.mockResolvedValue({ ...v1, company: "Globex", version: 2 });
    await renderDetail();
    const activityCalls = getContactActivities.mock.calls.length;

    await retype("Company", "Globex");
    await userEvent.click(saveButton());

    expect(updateContact).toHaveBeenCalledWith("c1", { version: 1, company: "Globex" });
    expect(await screen.findByText(/Version 2/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled(); // clean again
    await waitFor(() => expect(getContactActivities.mock.calls.length).toBe(activityCalls + 1));
  });

  it("sends one request even if Save is clicked repeatedly", async () => {
    let finish!: (c: typeof v1) => void;
    updateContact.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderDetail();
    await retype("Company", "Globex");

    await userEvent.click(saveButton());
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(updateContact).toHaveBeenCalledTimes(1);

    finish({ ...v1, company: "Globex", version: 2 });
    expect(await screen.findByText(/Version 2/)).toBeInTheDocument();
  });

  it("shows a duplicate-email error on the email field and keeps the draft", async () => {
    updateContact.mockRejectedValue(
      new ApiError(409, "DUPLICATE_EMAIL", "Another contact already uses this email"),
    );
    await renderDetail();
    await retype("Email", "taken@example.com");
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(field("Email")).toHaveAccessibleDescription("Another contact already uses this email"),
    );
    expect(field("Email")).toHaveValue("taken@example.com");
  });

  it("shows a network failure above the form and keeps the draft", async () => {
    updateContact.mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "offline"));
    await renderDetail();
    await retype("Company", "Globex");
    await userEvent.click(saveButton());

    expect(await screen.findByText(/Can't reach the server/)).toBeInTheDocument();
    expect(field("Company")).toHaveValue("Globex");
    expect(saveButton()).toBeEnabled(); // the user can retry
  });
});

describe("ContactDetailPage — unsaved changes", () => {
  /** True if the browser would ask "Leave site?" when closing the tab now. */
  const closingTabIsBlocked = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("warns before closing the tab only while there are unsaved edits", async () => {
    updateContact.mockResolvedValue({ ...v1, company: "Globex", version: 2 });
    await renderDetail();
    expect(closingTabIsBlocked()).toBe(false);

    await retype("Company", "Globex");
    expect(closingTabIsBlocked()).toBe(true);

    await userEvent.click(saveButton());
    await screen.findByText(/Version 2/);
    expect(closingTabIsBlocked()).toBe(false); // saved: nothing to lose
  });
});

describe("ContactDetailPage — conflicting updates", () => {
  // Someone else saved version 2 with a different company and last name.
  const theirs = { ...v1, company: "Initech", lastName: "Alvarez", version: 2 };

  beforeEach(() => {
    updateContact.mockRejectedValueOnce(
      new ApiError(409, "VERSION_CONFLICT", "changed by someone else", { current: theirs }),
    );
  });

  it("explains the conflict, keeps the draft, and shows their version", async () => {
    await renderDetail();
    await retype("Phone", "555-010-2030");
    await retype("Company", "Acme Ltd");
    await userEvent.click(saveButton());

    const banner = await screen.findByText(
      "Someone else changed this contact while you were editing.",
    );
    // Focus moves to the decision the user has to make.
    expect(screen.getByRole("button", { name: "Keep my changes" })).toHaveFocus();
    const table = within(banner.parentElement!).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1); // skip the header row
    expect(rows.map((row) => row.textContent)).toEqual([
      "Last nameAlvarezLee", // only they changed it
      "CompanyInitechAcme Ltd — you both changed this", // both changed it: flagged
    ]);

    expect(field("Phone")).toHaveValue("555-010-2030"); // draft kept
    expect(screen.getByRole("heading", { level: 1, name: "Ann Alvarez" })).toBeInTheDocument(); // their version shown
  });

  it("'Keep my changes' merges onto their version and saves against version 2", async () => {
    updateContact.mockResolvedValueOnce({
      ...theirs,
      phone: "555-010-2030",
      company: "Acme Ltd",
      version: 3,
    });
    await renderDetail();
    await retype("Phone", "555-010-2030");
    await retype("Company", "Acme Ltd");
    await userEvent.click(saveButton());
    await userEvent.click(await screen.findByRole("button", { name: "Keep my changes" }));

    expect(field("Last name")).toHaveValue("Alvarez"); // their change is not undone
    expect(field("Company")).toHaveValue("Acme Ltd"); // mine kept
    await userEvent.click(saveButton());

    expect(updateContact).toHaveBeenLastCalledWith("c1", {
      version: 2,
      phone: "555-010-2030",
      company: "Acme Ltd",
    });
    expect(await screen.findByText(/Version 3/)).toBeInTheDocument();
  });

  it("'Use their version' discards the draft", async () => {
    await renderDetail();
    await retype("Company", "Acme Ltd");
    await userEvent.click(saveButton());
    await userEvent.click(await screen.findByRole("button", { name: "Use their version" }));

    expect(field("Company")).toHaveValue("Initech");
    expect(saveButton()).toBeDisabled();
  });
});

describe("ContactDetailPage — tags", () => {
  it("adds a tag and refreshes the activity", async () => {
    addTag.mockResolvedValue({ contact: { ...v1, tags: ["vip", "partner"] }, changed: true });
    await renderDetail();
    const activityCalls = getContactActivities.mock.calls.length;

    await userEvent.type(screen.getByLabelText("New tag"), " Partner {Enter}");

    expect(addTag).toHaveBeenCalledWith("c1", "partner");
    expect(await screen.findByRole("button", { name: "Remove tag partner" })).toBeInTheDocument();
    await waitFor(() => expect(getContactActivities.mock.calls.length).toBe(activityCalls + 1));
  });

  it("explains a no-op when the tag already exists", async () => {
    addTag.mockResolvedValue({ contact: v1, changed: false });
    await renderDetail();
    await userEvent.type(screen.getByLabelText("New tag"), "VIP{Enter}");
    expect(await screen.findByText("“vip” is already on this contact.")).toBeInTheDocument();
  });

  it("shows the tag-limit error", async () => {
    addTag.mockRejectedValue(
      new ApiError(422, "TAG_LIMIT_EXCEEDED", "A contact can have at most 50 tags"),
    );
    await renderDetail();
    await userEvent.type(screen.getByLabelText("New tag"), "one-more{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A contact can have at most 50 tags",
    );
  });

  it("removes a tag", async () => {
    removeTag.mockResolvedValue({ contact: { ...v1, tags: [] }, changed: true });
    await renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "Remove tag vip" }));

    expect(removeTag).toHaveBeenCalledWith("c1", "vip");
    expect(await screen.findByText("No tags yet.")).toBeInTheDocument();
  });
});

describe("ContactDetailPage — activity timeline", () => {
  it("describes each kind of activity", async () => {
    getContactActivities.mockResolvedValue([
      makeActivity({
        type: "CONTACT_UPDATED",
        details: {
          changes: [
            { field: "company", from: "Acme", to: "Globex" },
            { field: "phone", from: null, to: "555" },
          ],
        },
      }),
      makeActivity({ type: "TAG_ADDED", details: { tag: "vip", bulkOperationId: "b1" } }),
      makeActivity({ type: "TAG_REMOVED", details: { tag: "lead" } }),
    ]);
    await renderDetail();

    expect(await screen.findByText("Updated details")).toBeInTheDocument();
    expect(screen.getByText("Company: “Acme” → “Globex”")).toBeInTheDocument();
    expect(screen.getByText("Phone: empty → “555”")).toBeInTheDocument();
    expect(screen.getByText("Added tag “vip” (bulk)")).toBeInTheDocument();
    expect(screen.getByText("Removed tag “lead”")).toBeInTheDocument();
  });

  it("shows an empty state when there is no activity", async () => {
    await renderDetail();
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });
});
