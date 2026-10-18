/**
 * Usage:  npm run seed                 (300 contacts)
 *         npm run seed -- --count=50000
 *
 * Deletes ALL contacts and activities in the target database, then inserts
 * deterministic demo data. Refuses to run in production or against a database
 * whose name doesn't end in _dev, _test, or _e2e.
 */
import { existsSync } from "node:fs";
import mongoose from "mongoose";
import { loadConfig } from "../config/env.js";
import { connectToDatabase, disconnectFromDatabase } from "../db/connection.js";
import { logger } from "../shared/logger.js";
import { assertSeedTarget, seedDatabase } from "./seedData.js";

const DEFAULT_COUNT = 300;
const MAX_COUNT = 200_000;

function parseCount(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--count="));
  if (!arg) return DEFAULT_COUNT;
  const count = Number(arg.slice("--count=".length));
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new Error(`--count must be an integer between 1 and ${MAX_COUNT}`);
  }
  return count;
}

async function main(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const config = loadConfig();
  const count = parseCount(process.argv.slice(2));

  // Connect without building indexes; seedDatabase syncs them explicitly.
  await connectToDatabase(config.MONGODB_URI, { autoIndex: false });
  const { host, name } = mongoose.connection;
  try {
    assertSeedTarget(config.NODE_ENV, name);
    logger.info("seeding", { host, database: name, count });
    const started = Date.now();
    const summary = await seedDatabase({ count });
    logger.info("seed complete", { ...summary, durationMs: Date.now() - started });
  } finally {
    await disconnectFromDatabase();
  }
}

main().catch((error: unknown) => {
  logger.error("seed failed", { error: error instanceof Error ? error.message : error });
  process.exitCode = 1;
});
