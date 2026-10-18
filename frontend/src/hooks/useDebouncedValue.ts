import { useEffect, useState } from "react";

/**
 * Returns `value` once it has stopped changing for `delayMs`. Typing "annette"
 * sends one search request instead of seven.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer); // a newer value restarts the wait
  }, [value, delayMs]);

  return debounced;
}
