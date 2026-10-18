import { useSyncExternalStore } from "react";

/**
 * True while the CSS media query matches, updating when it changes (window
 * resized, phone rotated). useSyncExternalStore subscribes to the browser's
 * MediaQueryList without an effect, so the first render already has the value.
 *
 * Environments without matchMedia (jsdom in tests) report false, i.e. desktop.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
}
