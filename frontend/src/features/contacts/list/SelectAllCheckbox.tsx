import { useEffect, useRef } from "react";
import type { Selection } from "../../../hooks/useSelection";

interface Props {
  pageIds: string[];
  selection: Selection;
  /** Accessible name when there is no visible label (the table header). */
  ariaLabel?: string;
  /** Visible label text (the card list). */
  label?: string;
}

/** Select / clear every contact on the current page; shows a dash when only some are selected. */
export function SelectAllCheckbox({ pageIds, selection, ariaLabel, label }: Props) {
  const selectedOnPage = pageIds.filter((id) => selection.isSelected(id)).length;
  const allSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  // "Some selected" can only be shown through the DOM property.
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selectedOnPage > 0 && !allSelected;
  }, [selectedOnPage, allSelected]);

  const checkbox = (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={() => selection.toggleAll(pageIds)}
      aria-label={label ? undefined : ariaLabel}
    />
  );
  return label ? (
    <label>
      {checkbox} {label}
    </label>
  ) : (
    checkbox
  );
}
