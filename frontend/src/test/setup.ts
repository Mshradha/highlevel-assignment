import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components after each test so tests never share DOM state.
afterEach(() => {
  cleanup();
});
