import mongoose, { type ClientSession } from "mongoose";

/**
 * Runs `work` in a MongoDB transaction: all of its writes commit together or
 * none do (ADR-002). Every repository call inside must pass `session`.
 *
 * The driver retries `work` on transient errors such as write conflicts, so
 * it may run more than once. It must only touch the database — no emails,
 * HTTP calls, or other side effects that can't be rolled back.
 */
export async function runInTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
