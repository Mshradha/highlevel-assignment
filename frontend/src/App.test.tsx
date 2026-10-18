import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api/contacts";
import { App } from "./App";
import { makeContact, makePage } from "./test/fixtures";

vi.mock("./api/contacts");

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getContacts).mockResolvedValue(makePage([]));
  vi.mocked(api.getContactActivities).mockResolvedValue([]);
});

describe("App routing", () => {
  it("redirects / to the contacts page", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "Contacts" })).toBeInTheDocument();
  });

  it("loads the contact whose id is in the URL", async () => {
    vi.mocked(api.getContactById).mockResolvedValue(
      makeContact({ id: "abc123", firstName: "Zed", lastName: "Adams" }),
    );
    renderAt("/contacts/abc123");

    expect(await screen.findByRole("heading", { level: 1, name: "Zed Adams" })).toBeInTheDocument();
    expect(api.getContactById).toHaveBeenCalledWith("abc123", expect.any(AbortSignal));
  });

  it("renders a not-found page for unknown routes", () => {
    renderAt("/nope");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
