/**
 * Usage:  npm run explain
 *
 * Read-only. Runs the list endpoint's real query shapes (same schema, filter
 * builder, and sort builder as the API) with explain("executionStats") and
 * prints which index each one used, how much it read, and whether MongoDB had
 * to sort in memory. Point MONGODB_URI at a large seed for meaningful numbers.
 */
import { existsSync } from "node:fs";
import mongoose from "mongoose";
import { loadConfig } from "../config/env.js";
import { connectToDatabase, disconnectFromDatabase } from "../db/connection.js";
import { ContactModel } from "../modules/contacts/contact.model.js";
import { buildListFilter, buildListSort } from "../modules/contacts/contact.query.js";
import { listContactsQuerySchema } from "../modules/contacts/contact.schemas.js";

const CASES: Array<[label: string, query: Record<string, string>]> = [
  ["browse, newest first", {}],
  ["browse, by name", { sortBy: "name" }],
  ["deep page (offset 9,980)", { page: "500" }],
  ["company + date sort", { company: "acme corp" }],
  ["company + name sort", { company: "acme corp", sortBy: "name" }],
  ["tag + date sort", { tags: "vip" }],
  ["two tags (AND) + date sort", { tags: "vip,lead" }],
  ["search 'ann' + date sort", { q: "ann" }],
  ["search 'ann' + name sort", { q: "ann", sortBy: "name" }],
  ["search 'jo' (broad prefix)", { q: "jo" }],
  ["search phone '(415) 5'", { q: "(415) 5" }],
  ["search + company + tag", { q: "ann", company: "acme corp", tags: "vip" }],
];

interface Stage {
  stage: string;
  indexName?: string;
  inputStage?: Stage;
  inputStages?: Stage[];
}

function stages(plan: Stage | undefined, out: string[] = []): string[] {
  if (!plan) return out;
  out.push(plan.indexName ? `${plan.stage}(${plan.indexName})` : plan.stage);
  stages(plan.inputStage, out);
  plan.inputStages?.forEach((s) => stages(s, out));
  return out;
}

async function main(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const config = loadConfig();
  await connectToDatabase(config.MONGODB_URI, { autoIndex: false });
  const db = mongoose.connection.db!;

  const pingStart = performance.now();
  await db.admin().ping();
  const rttMs = performance.now() - pingStart;
  const total = await ContactModel.estimatedDocumentCount();
  console.log(
    `database: ${mongoose.connection.name} | contacts: ${total} | network round trip: ${rttMs.toFixed(0)} ms\n`,
  );

  const rows = [];
  for (const [label, raw] of CASES) {
    const query = listContactsQuerySchema.parse(raw);
    const filter = buildListFilter(query);
    const sort = buildListSort(query);

    const explain = (await ContactModel.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .explain("executionStats")) as unknown as {
      queryPlanner: { winningPlan: Stage & { queryPlan?: Stage } };
      executionStats: {
        nReturned: number;
        totalKeysExamined: number;
        totalDocsExamined: number;
        executionTimeMillis: number;
      };
    };
    const plan = stages(
      explain.queryPlanner.winningPlan.queryPlan ?? explain.queryPlanner.winningPlan,
    );
    const e = explain.executionStats;

    const countStart = performance.now();
    const matches = await ContactModel.countDocuments(filter);
    const countMs = performance.now() - countStart;

    rows.push({
      query: label,
      returned: e.nReturned,
      matches,
      keysRead: e.totalKeysExamined,
      docsRead: e.totalDocsExamined,
      inMemorySort: plan.some((s) => s === "SORT") ? "YES" : "no",
      collScan: plan.some((s) => s === "COLLSCAN") ? "YES" : "no",
      findMs: e.executionTimeMillis,
      countMs: Math.round(countMs),
      plan: plan.join(" <- "),
    });
  }
  console.table(rows.map(({ plan: _plan, ...r }) => r));
  console.log("\nplans:");
  for (const r of rows) console.log(`  ${r.query.padEnd(28)} ${r.plan}`);

  const exactStart = performance.now();
  await ContactModel.countDocuments({});
  const exactMs = performance.now() - exactStart;
  const estimatedStart = performance.now();
  await ContactModel.estimatedDocumentCount();
  const estimatedMs = performance.now() - estimatedStart;
  console.log(
    `\nunfiltered total: countDocuments ${exactMs.toFixed(0)} ms vs estimatedDocumentCount ${estimatedMs.toFixed(0)} ms (both include the network round trip)`,
  );
  console.log("findMs is server-side execution time; countMs includes the network round trip.");

  await disconnectFromDatabase();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
