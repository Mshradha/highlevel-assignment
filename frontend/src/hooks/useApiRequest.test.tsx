import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useApiRequest } from "./useApiRequest";

/**
 * A fetcher whose responses the test resolves by hand, in any order, and that
 * rejects with an AbortError when its signal is aborted (like real fetch).
 */
function controllableFetcher<T>() {
  const calls: Array<{
    signal: AbortSignal;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
  }> = [];
  const fetcher = vi.fn(
    (signal: AbortSignal) =>
      new Promise<T>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
        signal.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }),
  );
  return { fetcher, calls };
}

const settle = () => act(async () => {}); // flush resolved promises into React state

describe("useApiRequest", () => {
  it("starts loading, then exposes the data", async () => {
    const { fetcher, calls } = controllableFetcher<string>();
    const { result } = renderHook(() => useApiRequest("a", fetcher));

    expect(result.current).toMatchObject({ status: "loading", data: undefined });
    calls[0]!.resolve("A");
    await settle();
    expect(result.current).toMatchObject({ status: "success", data: "A", error: undefined });
  });

  it("exposes errors and recovers on refetch", async () => {
    const { fetcher, calls } = controllableFetcher<string>();
    const { result } = renderHook(() => useApiRequest("a", fetcher));

    const failure = new ApiError(0, "NETWORK_ERROR", "offline");
    calls[0]!.reject(failure);
    await settle();
    expect(result.current).toMatchObject({ status: "error", error: failure });

    act(() => result.current.refetch());
    expect(result.current.status).toBe("loading");
    calls[1]!.resolve("A");
    await settle();
    expect(result.current).toMatchObject({ status: "success", data: "A", error: undefined });
  });

  it("never lets a slow old response overwrite a newer one", async () => {
    const { fetcher, calls } = controllableFetcher<string>();
    const { result, rerender } = renderHook(({ k }) => useApiRequest(k, fetcher), {
      initialProps: { k: "ann" },
    });
    rerender({ k: "anne" }); // the user kept typing

    calls[1]!.resolve("results for anne"); // the newer request answers first
    await settle();
    calls[0]!.resolve("results for ann"); // the old one arrives late
    await settle();

    expect(result.current.data).toBe("results for anne");
  });

  it("ignores a late response even when the source doesn't honour the abort signal", async () => {
    // Real fetch rejects once aborted, but a response that already resolved just
    // before the abort (or a source that ignores the signal) still arrives. The
    // hook's own guard must drop it. (Verified: removing the guard fails this test.)
    const resolvers: Array<(value: string) => void> = [];
    const ignoresSignal = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));
    const { result, rerender } = renderHook(({ k }) => useApiRequest(k, ignoresSignal), {
      initialProps: { k: "ann" },
    });
    rerender({ k: "anne" });

    resolvers[1]!("results for anne");
    await settle();
    resolvers[0]!("results for ann");
    await settle();

    expect(result.current).toMatchObject({ status: "success", data: "results for anne" });
  });

  it("aborts the previous request when the key changes", () => {
    const { fetcher, calls } = controllableFetcher<string>();
    const { rerender } = renderHook(({ k }) => useApiRequest(k, fetcher), {
      initialProps: { k: "page-1" },
    });
    rerender({ k: "page-2" });

    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.signal.aborted).toBe(false);
  });

  it("aborts on unmount and ignores the response afterwards", async () => {
    const { fetcher, calls } = controllableFetcher<string>();
    const consoleError = vi.spyOn(console, "error");
    const { unmount } = renderHook(() => useApiRequest("a", fetcher));

    unmount();
    expect(calls[0]!.signal.aborted).toBe(true);
    calls[0]!.resolve("too late");
    await settle();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not treat a cancellation as an error", async () => {
    const { fetcher } = controllableFetcher<string>();
    const { result, rerender } = renderHook(({ k }) => useApiRequest(k, fetcher), {
      initialProps: { k: "a" },
    });
    rerender({ k: "b" }); // aborts "a"
    await settle();
    expect(result.current).toMatchObject({ status: "loading", error: undefined });
  });

  it("works under Strict Mode's double mount: first request aborted, second one used", async () => {
    const { fetcher, calls } = controllableFetcher<string>();
    const { result } = renderHook(() => useApiRequest("a", fetcher), {
      wrapper: StrictMode,
    });

    expect(fetcher).toHaveBeenCalledTimes(2); // mount → unmount → mount, in development
    expect(calls[0]!.signal.aborted).toBe(true);

    calls[1]!.resolve("A");
    await settle();
    expect(result.current).toMatchObject({ status: "success", data: "A" });
  });

  it("keeps showing data while refetching the same key", async () => {
    const { fetcher, calls } = controllableFetcher<string>();
    const { result } = renderHook(() => useApiRequest("a", fetcher));
    calls[0]!.resolve("v1");
    await settle();

    act(() => result.current.refetch());
    expect(result.current).toMatchObject({ status: "loading", data: "v1", isRefreshing: true });
    calls[1]!.resolve("v2");
    await settle();
    expect(result.current).toMatchObject({ status: "success", data: "v2", isRefreshing: false });
  });

  it("clears data for a new key but keeps it as previousData (e.g. the old page)", async () => {
    const { fetcher, calls } = controllableFetcher<string>();
    const { result, rerender } = renderHook(({ k }) => useApiRequest(k, fetcher), {
      initialProps: { k: "page-1" },
    });
    calls[0]!.resolve("page 1 rows");
    await settle();

    rerender({ k: "page-2" });
    expect(result.current).toMatchObject({
      status: "loading",
      data: undefined,
      previousData: "page 1 rows",
    });
  });

  it("setData replaces the data without a request (e.g. a save's response)", async () => {
    const { fetcher, calls } = controllableFetcher<string>();
    const { result } = renderHook(() => useApiRequest("a", fetcher));
    calls[0]!.resolve("v1");
    await settle();

    act(() => result.current.setData("saved v2"));
    expect(result.current).toMatchObject({ status: "success", data: "saved v2" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not refetch when the component re-renders with the same key", () => {
    const { fetcher } = controllableFetcher<string>();
    const { rerender } = renderHook(() => useApiRequest("a", fetcher));
    rerender();
    rerender();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
