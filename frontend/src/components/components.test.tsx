import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { Button } from "./Button";
import { EmptyState, ErrorState, LoadingState } from "./StateViews";
import { TagChip } from "./TagChip";
import { TextField } from "./TextField";

describe("state views", () => {
  it("LoadingState is announced as a status", () => {
    render(<LoadingState label="Loading contacts…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading contacts…");
  });

  it("ErrorState shows a friendly message and retries on click", async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(0, "NETWORK_ERROR", "raw")} onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("ErrorState hides the retry button when there is nothing to retry", () => {
    render(<ErrorState error={new Error("x")} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("EmptyState shows its title and content", () => {
    render(<EmptyState title="No contacts match">Try a different search.</EmptyState>);
    expect(screen.getByText("No contacts match")).toBeInTheDocument();
    expect(screen.getByText("Try a different search.")).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("is disabled and shows the busy label while busy, so it can't be submitted twice", async () => {
    const onClick = vi.fn();
    render(
      <Button busy busyLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving…" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});

describe("TextField", () => {
  it("links the label, hint, and error to the input", () => {
    render(<TextField label="Email" hint="Optional" error="Invalid email" defaultValue="x" />);
    const input = screen.getByLabelText("Email");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Optional Invalid email");
  });

  it("is not marked invalid without an error", () => {
    render(<TextField label="Company" />);
    expect(screen.getByLabelText("Company")).not.toHaveAttribute("aria-invalid");
  });
});

describe("TagChip", () => {
  it("gives the remove button an accessible name that includes the tag", async () => {
    const onRemove = vi.fn();
    render(<TagChip tag="vip" onRemove={onRemove} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove tag vip" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("has no button when it can't be removed", () => {
    render(<TagChip tag="vip" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
