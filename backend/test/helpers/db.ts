import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectToDatabase, disconnectFromDatabase } from "../../src/db/connection.js";
import { ActivityModel } from "../../src/modules/activities/activity.model.js";
import { ContactModel } from "../../src/modules/contacts/contact.model.js";

/**
 * Starts a private in-memory replica set for one test file (each file runs in
 * its own worker, so files never share data) and builds all indexes up front,
 * so unique-index tests don't race the background index build.
 */
export async function startTestDatabase(): Promise<{ stop: () => Promise<void> }> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectToDatabase(replSet.getUri("crm_test"), { autoIndex: false });
  await ContactModel.syncIndexes();
  await ActivityModel.syncIndexes();
  return {
    stop: async () => {
      await disconnectFromDatabase();
      await replSet.stop();
    },
  };
}

/** Call in beforeEach: every test starts from empty collections. */
export async function clearDatabase(): Promise<void> {
  await Promise.all([ContactModel.deleteMany({}), ActivityModel.deleteMany({})]);
}
