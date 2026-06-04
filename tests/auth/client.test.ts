import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { readCredentials } from "../../src/auth/client.js";

vi.mock("../../src/config.js", () => ({
  CREDENTIALS_FILE: "/tmp/mcp-gcs-test-auth/credentials.json",
}));

const TEST_DIR = "/tmp/mcp-gcs-test-auth";
const TEST_CREDENTIALS_FILE = "/tmp/mcp-gcs-test-auth/credentials.json";

describe("auth/client", () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("readCredentials", () => {
    it("throws when credentials file does not exist", () => {
      expect(() => readCredentials()).toThrow(/Credentials file not found/);
    });

    it("throws when credentials file lacks installed and web keys", () => {
      fs.writeFileSync(TEST_CREDENTIALS_FILE, JSON.stringify({ other: {} }));
      expect(() => readCredentials()).toThrow(/must contain either an "installed" or "web"/);
    });

    it("returns installed config when present", () => {
      fs.writeFileSync(
        TEST_CREDENTIALS_FILE,
        JSON.stringify({
          installed: {
            client_id: "cid",
            client_secret: "cs",
          },
        })
      );
      const result = readCredentials();
      expect(result).toEqual({ client_id: "cid", client_secret: "cs" });
    });

    it("returns web config when present", () => {
      fs.writeFileSync(
        TEST_CREDENTIALS_FILE,
        JSON.stringify({
          web: {
            client_id: "wid",
            client_secret: "ws",
          },
        })
      );
      const result = readCredentials();
      expect(result).toEqual({ client_id: "wid", client_secret: "ws" });
    });

    it("prefers installed over web when both present", () => {
      fs.writeFileSync(
        TEST_CREDENTIALS_FILE,
        JSON.stringify({
          installed: { client_id: "i", client_secret: "s" },
          web: { client_id: "w", client_secret: "s" },
        })
      );
      const result = readCredentials();
      expect(result.client_id).toBe("i");
    });
  });
});
