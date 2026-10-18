import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { isAbortError } from "../api/client";

export type RequestStatus = "loading" | "success" | "error";

export interface ApiRequest<T> {
  status: RequestStatus;
  /** Data for the current key. Kept while a refetch of the same key is in flight. */
  data: T | undefined;
  /** The last successful data for ANY key, e.g. the previous page while the next one loads. */
  previousData: T | undefined;
  error: unknown;
  /** Loading again for a key that already has data (refetch after a change). */
  isRefreshing: boolean;
  refetch: () => void;
  /** Replace the current data, e.g. with the contact returned by a successful save. */
  setData: (data: T) => void;
}

interface Settled<T> {
  run: string; // key + reload counter: identifies one request
  outcome: { ok: true; data: T } | { ok: false; error: unknown };
}

/**
 * Server data without a server-state library (ADR-010).
 *
 * `key` identifies what is being fetched (e.g. a contact id or the serialized
 * list query). Whenever it changes, the previous request is aborted and a new
 * one starts. Guarantees:
 *   - no stale responses: only the request for the current key may set state,
 *     so a slow old response can never replace a newer one;
 *   - cancellation: the request is aborted on key change and on unmount;
 *   - Strict Mode safe: the dev-only mount → unmount → mount aborts the first
 *     request, and only the second one's result is used.
 *
 * Loading is derived, not stored: the hook is loading whenever its last
 * finished request isn't the current one. So there is no "loading" flag that
 * can get out of sync.
 */
export function useApiRequest<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
): ApiRequest<T> {
  const [reloadCount, setReloadCount] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>();
  const [lastGood, setLastGood] = useState<{ key: string; data: T }>();

  const run = `${key}#${reloadCount}`;

  // Effect event: always sees the latest `fetcher` (which is a new closure on
  // every render) without making the effect re-run when it changes.
  const startRequest = useEffectEvent((signal: AbortSignal) => fetcher(signal));

  useEffect(() => {
    const controller = new AbortController();
    startRequest(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return; // superseded: a newer request owns the state
        setSettled({ run, outcome: { ok: true, data } });
        setLastGood({ key, data });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setSettled({ run, outcome: { ok: false, error } });
      },
    );
    return () => controller.abort();
  }, [key, run]);

  const isCurrent = settled?.run === run;
  const status: RequestStatus = !isCurrent ? "loading" : settled.outcome.ok ? "success" : "error";
  const data = lastGood?.key === key ? lastGood.data : undefined;

  const refetch = useCallback(() => setReloadCount((n) => n + 1), []);
  const setData = useCallback(
    (next: T) => {
      setLastGood({ key, data: next });
      setSettled({ run, outcome: { ok: true, data: next } });
    },
    [key, run],
  );

  return {
    status,
    data,
    previousData: lastGood?.data,
    error: isCurrent && !settled.outcome.ok ? settled.outcome.error : undefined,
    isRefreshing: status === "loading" && data !== undefined,
    refetch,
    setData,
  };
}
