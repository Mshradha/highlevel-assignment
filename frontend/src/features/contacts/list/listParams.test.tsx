import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import {
  applyListChange,
  type ListState,
  parseListState,
  serializeListState,
  toApiParams,
} from "./listParams";
import { useListQueryState } from "./useListQueryState";

const parse = (qs: string) => parseListState(new URLSearchParams(qs));
const DEFAULTS: ListState = {
  q: "",
  company: "",
  tags: [],
  sortBy: "createdAt",
  sortOrder: "desc",
  page: 1,
};

describe("parseListState", () => {
  it("uses defaults for an empty URL", () => {
    expect(parse("")).toEqual(DEFAULTS);
  });

  it("reads every parameter and normalizes tags", () => {
    expect(
      parse("q=ann&company=Acme&tags=VIP,%20lead%20,vip&sortBy=name&sortOrder=desc&page=3"),
    ).toEqual({
      q: "ann",
      company: "Acme",
      tags: ["vip", "lead"],
      sortBy: "name",
      sortOrder: "desc",
      page: 3,
    });
  });

  it.each([
    ["sortBy=email", { sortBy: "createdAt" }],
    ["sortOrder=up", { sortOrder: "desc" }],
    ["sortBy=name", { sortOrder: "asc" }], // name's natural direction
    ["page=0", { page: 1 }],
    ["page=-2", { page: 1 }],
    ["page=abc", { page: 1 }],
    ["page=1.5", { page: 1 }],
    ["page=99999", { page: 1 }], // beyond the backend's maximum offset
    ["tags=%3Cb%3E,ok", { tags: ["ok"] }], // invalid tag dropped
  ])("falls back to a default for %s", (qs, expected) => {
    expect(parse(qs)).toMatchObject(expected);
  });
});

describe("serializeListState", () => {
  it("omits defaults so the plain list URL stays clean", () => {
    expect(serializeListState(DEFAULTS).toString()).toBe("");
  });

  it("round-trips a non-default state", () => {
    const state = parse("q=ann&tags=vip,lead&sortBy=name&page=2");
    expect(parse(serializeListState(state).toString())).toEqual(state);
  });
});

describe("applyListChange", () => {
  const onPage4 = { ...DEFAULTS, q: "ann", page: 4 };

  it.each([
    ["search", { q: "anne" }],
    ["company", { company: "Acme" }],
    ["tags", { tags: ["vip"] }],
    ["sort field", { sortBy: "name" as const }],
    ["sort direction", { sortOrder: "asc" as const }],
  ])("goes back to page 1 when the %s changes", (_label, change) => {
    expect(applyListChange(onPage4, change).page).toBe(1);
  });

  it("keeps the page when only the page changes, or when nothing really changed", () => {
    expect(applyListChange(onPage4, { page: 5 }).page).toBe(5);
    expect(applyListChange(onPage4, { q: "ann" }).page).toBe(4);
  });

  it("resets the sort direction to the new field's default", () => {
    expect(applyListChange(DEFAULTS, { sortBy: "name" }).sortOrder).toBe("asc");
  });
});

describe("toApiParams", () => {
  it("doesn't send a 1-character search (the backend requires 2+)", () => {
    expect(toApiParams({ ...DEFAULTS, q: "a" })).not.toHaveProperty("q");
    expect(toApiParams({ ...DEFAULTS, q: "an" })).toMatchObject({ q: "an" });
  });

  it("omits empty filters and always sends sort, page, and limit", () => {
    expect(toApiParams(DEFAULTS)).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      limit: 20,
    });
  });
});

describe("useListQueryState", () => {
  function setup(initialUrl: string) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
    );
    return renderHook(
      () => {
        const [state, update] = useListQueryState();
        return { state, update, location: useLocation() };
      },
      { wrapper },
    );
  }

  it("reads the state from the URL", () => {
    const { result } = setup("/contacts?q=ann&page=3");
    expect(result.current.state).toMatchObject({ q: "ann", page: 3 });
  });

  it("writes changes to the URL, resetting the page when the criteria change", () => {
    const { result } = setup("/contacts?q=ann&page=3");
    act(() => result.current.update({ tags: ["vip"] }));
    expect(result.current.location.search).toBe("?q=ann&tags=vip");
    expect(result.current.state.page).toBe(1);
  });

  it("keeps other parameters when changing the page", () => {
    const { result } = setup("/contacts?q=ann");
    act(() => result.current.update({ page: 2 }));
    expect(result.current.location.search).toBe("?q=ann&page=2");
  });
});
