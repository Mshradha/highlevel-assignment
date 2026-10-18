import { useCallback, useMemo, useState } from "react";

export interface Selection {
  selected: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Select all of `ids`, or clear them if they are all selected already. */
  toggleAll: (ids: string[]) => void;
  clear: () => void;
}

/** UI state for multi-select (bulk tagging). Local to the list page; never global. */
export function useSelection(): Selection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[]) => {
    setSelected((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
      const next = new Set(current);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({ selected, isSelected: (id: string) => selected.has(id), toggle, toggleAll, clear }),
    [selected, toggle, toggleAll, clear],
  );
}
