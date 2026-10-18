import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // API_PROXY_TARGET has no VITE_ prefix, so it is used here only and never shipped to the browser.
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.API_PROXY_TARGET || "http://localhost:4000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // The browser calls /api on the Vite origin; Vite forwards to Express. Same origin → no CORS.
      proxy: { "/api": apiTarget },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
