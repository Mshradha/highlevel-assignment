import mongoose from "mongoose";

export async function connectToDatabase(uri: string): Promise<void> {
  // Reject query filters on fields that are not in the schema instead of ignoring them.
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 });
  await assertReplicaSet();
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/** True when the connection is open and the server answers a ping. */
export async function pingDatabase(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !db) {
    return false;
  }
  try {
    await db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Contact updates and their activity records are written in one transaction
 * (ADR-002), and MongoDB only supports transactions on a replica set.
 * Failing at startup is clearer than failing on the first update.
 */
async function assertReplicaSet(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection has no database handle");
  }
  const hello = await db.admin().command({ hello: 1 });
  if (typeof hello.setName !== "string") {
    await mongoose.disconnect();
    throw new Error(
      "MongoDB is not running as a replica set, but transactions require one. " +
        "Use a MongoDB Atlas cluster (always a replica set) or a local mongod started with --replSet.",
    );
  }
}
