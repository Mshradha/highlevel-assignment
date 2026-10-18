import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./useDebouncedValue";
import { useSelection } from "./useSelection";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("only updates after the value has stopped changing for the delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
      initialProps: { v: "" },
    });

    for (const typed of ["a", "an", "ann"]) {
      rerender({ v: typed });
      act(() => vi.advanceTimersByTime(100)); // typing faster than the delay
    }
    expect(result.current).toBe(""); // nothing yet

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("ann"); // only the final value, once
  });
});

describe("useSelection", () => {
  it("toggles single ids", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("a"));
    expect([...result.current.selected]).toEqual(["b"]);
    expect(result.current.isSelected("b")).toBe(true);
  });

  it("toggleAll selects a page, or clears it when it's fully selected", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("a"));

    act(() => result.current.toggleAll(["a", "b", "c"]));
    expect([...result.current.selected].sort()).toEqual(["a", "b", "c"]);

    act(() => result.current.toggleAll(["a", "b", "c"]));
    expect(result.current.selected.size).toBe(0);
  });

  it("clear() empties the selection", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggleAll(["a", "b"]));
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });
});
