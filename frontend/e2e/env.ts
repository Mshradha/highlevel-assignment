import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * End-to-end tests run against their own servers and their own database, so
 * they never touch development data:
 *   - backend on 4100, frontend on 5180 (dev uses 4000 / 5173);
 *   - database `crm_e2e`, re-seeded before every run.
 */
export const E2E_API_PORT = 4100;
export const E2E_WEB_PORT = 5180;
export const BACKEND_DIR = fileURLToPath(new URL("../../backend", import.meta.url));

/**
 * E2E_MONGODB_URI if set; otherwise the backend's MONGODB_URI (from
 * backend/.env) with the database name replaced by `crm_e2e`.
 */
export function e2eMongoUri(): string {
  if (process.env.E2E_MONGODB_URI) return process.env.E2E_MONGODB_URI;

  const envFile = `${BACKEND_DIR}/.env`;
  const line = existsSync(envFile)
    ? readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .find((l) => l.startsWith("MONGODB_URI="))
    : undefined;
  if (!line) {
    throw new Error(
      "Set E2E_MONGODB_URI, or MONGODB_URI in backend/.env, to run end-to-end tests.",
    );
  }
  const url = new URL(line.slice("MONGODB_URI=".length).trim());
  url.pathname = "/crm_e2e";
  return url.toString();
}
