import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "./App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing", () => {
  it("redirects / to the contacts page", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "Contacts" })).toBeInTheDocument();
  });

  it("renders the contact detail route with the id from the URL", () => {
    renderAt("/contacts/abc123");
    expect(screen.getByRole("heading", { level: 1, name: "Contact abc123" })).toBeInTheDocument();
  });

  it("renders a not-found page for unknown routes", () => {
    renderAt("/nope");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
