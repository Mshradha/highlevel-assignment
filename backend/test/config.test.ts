import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

describe("loadConfig", () => {
  it("applies defaults for optional variables", () => {
    const config = loadConfig({ MONGODB_URI: "mongodb://localhost:27017/x" });
    expect(config).toEqual({
      NODE_ENV: "development",
      PORT: 4000,
      MONGODB_URI: "mongodb://localhost:27017/x",
    });
  });

  it("parses PORT from a string", () => {
    expect(loadConfig({ MONGODB_URI: "mongodb://h/x", PORT: "5050" }).PORT).toBe(5050);
  });

  it("rejects a missing MONGODB_URI", () => {
    expect(() => loadConfig({})).toThrow(/MONGODB_URI/);
  });

  it("rejects an invalid PORT and NODE_ENV", () => {
    expect(() => loadConfig({ MONGODB_URI: "mongodb://h/x", PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ MONGODB_URI: "mongodb://h/x", NODE_ENV: "staging" })).toThrow(
      /NODE_ENV/,
    );
  });
});
