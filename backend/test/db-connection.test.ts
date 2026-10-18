import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectToDatabase } from "../src/db/connection.js";

describe("connectToDatabase", () => {
  let standalone: MongoMemoryServer;

  beforeAll(async () => {
    standalone = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await standalone?.stop();
  });

  it("refuses a standalone server because transactions need a replica set", async () => {
    await expect(connectToDatabase(standalone.getUri())).rejects.toThrow(
      /not running as a replica set/,
    );
    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.disconnected);
  });
});
