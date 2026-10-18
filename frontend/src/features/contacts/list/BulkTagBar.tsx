import { type FormEvent, useId, useState } from "react";
import { bulkAssignTag } from "../../../api/contacts";
import type { BulkTagResult } from "../../../api/types";
import { Button } from "../../../components/Button";
import ui from "../../../components/ui.module.css";
import { describeError } from "../../../utils/errors";
import { normalizeTagInput, TAG_PATTERN } from "./listParams";
import styles from "./ContactsPage.module.css";

interface Props {
  selectedIds: string[];
  onDone: (result: BulkTagResult) => void;
  onClear: () => void;
}

/** Shown while contacts are selected. Assigns one tag to all of them in one request. */
export function BulkTagBar({ selectedIds, onDone, onClear }: Props) {
  const inputId = useId();
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const count = selectedIds.length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return; // a second Enter while saving does nothing
    const normalized = normalizeTagInput(tag);
    if (!TAG_PATTERN.test(normalized)) {
      setError("Enter a tag: letters, digits, spaces, - and _ (up to 40 characters)");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await bulkAssignTag(selectedIds, normalized);
      setTag("");
      onDone(result);
    } catch (err) {
      setError(describeError(err)); // selection is kept so the user can retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.bulkBar} onSubmit={submit} aria-label="Bulk actions">
      <strong>{count} selected</strong>
      <label htmlFor={inputId} className="visually-hidden">
        Tag to add to the selected contacts
      </label>
      <input
        id={inputId}
        className={ui.input}
        placeholder="Tag to add"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        maxLength={40}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
      />
      <Button type="submit" variant="primary" busy={busy} busyLabel="Adding…">
        Add tag to {count}
      </Button>
      <Button onClick={onClear} disabled={busy}>
        Clear selection
      </Button>
      {error && (
        <span id={`${inputId}-error`} className={ui.fieldError} role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
