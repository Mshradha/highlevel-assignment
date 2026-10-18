import { useEffect, useEffectEvent, useState } from "react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";

/**
 * A text box whose committed value lives somewhere else (the URL).
 *
 * - Typing updates the box immediately; the value is committed once typing
 *   pauses (debounced), so "annette" sends one request, not seven.
 * - Values shorter than `minLength` (but not empty) are never committed.
 * - If the committed value changes from OUTSIDE — back button, "Clear
 *   filters" — the box follows it. A change that is just our own commit
 *   coming back is recognized and doesn't overwrite what the user is typing.
 */
export function useSyncedTextInput(
  committed: string,
  commit: (value: string) => void,
  { minLength = 0, delayMs = 300 }: { minLength?: number; delayMs?: number } = {},
) {
  const [text, setText] = useState(committed);
  const debounced = useDebouncedValue(text, delayMs);

  // Adjusting state during render when an input changes (React's recommended
  // alternative to an effect): see "Storing information from previous renders".
  const [seenCommitted, setSeenCommitted] = useState(committed);
  if (committed !== seenCommitted) {
    setSeenCommitted(committed);
    if (committed !== debounced.trim()) setText(committed);
  }

  const commitIfChanged = useEffectEvent((value: string) => {
    if (value === committed) return;
    if (value.length > 0 && value.length < minLength) return;
    commit(value);
  });

  useEffect(() => {
    commitIfChanged(debounced.trim());
  }, [debounced]);

  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < minLength;
  return { text, setText, tooShort };
}
