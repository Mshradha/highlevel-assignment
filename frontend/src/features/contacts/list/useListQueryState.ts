import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { applyListChange, type ListState, parseListState, serializeListState } from "./listParams";

/**
 * The list's search/filter/sort/page, read from and written to the URL.
 * `replace` is for changes that shouldn't each add a history entry — typing
 * in the search box — so the back button goes to the previous real view.
 */
export function useListQueryState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseListState(searchParams), [searchParams]);

  const update = useCallback(
    (change: Partial<ListState>, options: { replace?: boolean } = {}) => {
      setSearchParams(
        (current) => serializeListState(applyListChange(parseListState(current), change)),
        {
          replace: options.replace ?? false,
        },
      );
    },
    [setSearchParams],
  );

  return [state, update] as const;
}
