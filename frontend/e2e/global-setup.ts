import { execSync } from "node:child_process";
import { BACKEND_DIR, e2eMongoUri } from "./env";

/**
 * Re-seeds `crm_e2e` with the same deterministic 300 contacts before every
 * run, so tests start from known data and a run never depends on the last one.
 * The seed's own guard refuses any database not named *_dev/*_test/*_e2e.
 */
export default function globalSetup(): void {
  // A fixed command string (no user input), so running it through a shell is
  // safe; a shell is needed on Windows, where npx is a .cmd file.
  execSync("npx tsx src/scripts/seed.ts", {
    cwd: BACKEND_DIR,
    env: { ...process.env, MONGODB_URI: e2eMongoUri(), NODE_ENV: "test" },
    stdio: "inherit",
  });
}
