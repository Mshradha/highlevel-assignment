import type { BulkTagResult } from "../../../api/types";

/** "Added "vip" to 3 contacts. 1 already had it. 2 no longer exist." */
export function describeBulkResult(result: BulkTagResult): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [`Added “${result.tag}” to ${plural(result.modified, "contact")}.`];
  if (result.alreadyTagged > 0) parts.push(`${result.alreadyTagged} already had it.`);
  if (result.skippedTagLimit > 0) {
    parts.push(`${plural(result.skippedTagLimit, "contact")} skipped (50-tag limit).`);
  }
  if (result.notFound.length > 0) {
    parts.push(`${plural(result.notFound.length, "contact")} no longer exist.`);
  }
  return parts.join(" ");
}
