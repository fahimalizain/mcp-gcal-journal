import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { listAccounts, getAccount, saveAccount, removeAccount } from "../../src/store/accounts.js";

const TEST_DIR = "/tmp/mcp-gcs-test-accounts";
const TEST_ACCOUNTS_FILE = "/tmp/mcp-gcs-test-accounts/accounts.json";

vi.mock("../../src/config.js", () => ({
  BASE_DIR: "/tmp/mcp-gcs-test-accounts",
  ACCOUNTS_FILE: "/tmp/mcp-gcs-test-accounts/accounts.json",
  PREFERENCES_FILE: "/tmp/mcp-gcs-test-accounts/preferences.json",
  CREDENTIALS_FILE: "/tmp/mcp-gcs-test-accounts/credentials.json",
}));

describe("store/accounts", () => {
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

  describe("listAccounts", () => {
    it("returns empty array when file does not exist", () => {
      const result = listAccounts();
      expect(result).toEqual([]);
    });

    it("returns accounts from file", () => {
      fs.writeFileSync(
        TEST_ACCOUNTS_FILE,
        JSON.stringify({
          accounts: [
            { account_id: "a1", email: "a1@example.com", refresh_token: "rt1" },
          ],
        })
      );
      const result = listAccounts();
      expect(result).toHaveLength(1);
      expect(result[0].account_id).toBe("a1");
    });
  });

  describe("getAccount", () => {
    it("returns account when found", () => {
      fs.writeFileSync(
        TEST_ACCOUNTS_FILE,
        JSON.stringify({
          accounts: [
            { account_id: "a1", email: "a1@example.com", refresh_token: "rt1" },
            { account_id: "a2", email: "a2@example.com", refresh_token: "rt2" },
          ],
        })
      );
      const result = getAccount("a2");
      expect(result).toBeDefined();
      expect(result?.email).toBe("a2@example.com");
    });

    it("returns undefined when not found", () => {
      fs.writeFileSync(
        TEST_ACCOUNTS_FILE,
        JSON.stringify({
          accounts: [{ account_id: "a1", email: "a1@example.com", refresh_token: "rt1" }],
        })
      );
      const result = getAccount("missing");
      expect(result).toBeUndefined();
    });
  });

  describe("saveAccount", () => {
    it("appends new account", () => {
      fs.writeFileSync(TEST_ACCOUNTS_FILE, JSON.stringify({ accounts: [] }));
      const newAccount = { account_id: "a1", email: "a1@example.com", refresh_token: "rt1" };
      saveAccount(newAccount);
      const written = JSON.parse(fs.readFileSync(TEST_ACCOUNTS_FILE, "utf-8"));
      expect(written.accounts).toHaveLength(1);
      expect(written.accounts[0].account_id).toBe("a1");
    });

    it("updates existing account", () => {
      fs.writeFileSync(
        TEST_ACCOUNTS_FILE,
        JSON.stringify({
          accounts: [{ account_id: "a1", email: "old@example.com", refresh_token: "rt1" }],
        })
      );
      const updated = { account_id: "a1", email: "new@example.com", refresh_token: "rt2" };
      saveAccount(updated);
      const written = JSON.parse(fs.readFileSync(TEST_ACCOUNTS_FILE, "utf-8"));
      expect(written.accounts).toHaveLength(1);
      expect(written.accounts[0].email).toBe("new@example.com");
      expect(written.accounts[0].refresh_token).toBe("rt2");
    });
  });

  describe("removeAccount", () => {
    it("removes account by id", () => {
      fs.writeFileSync(
        TEST_ACCOUNTS_FILE,
        JSON.stringify({
          accounts: [
            { account_id: "a1", email: "a1@example.com", refresh_token: "rt1" },
            { account_id: "a2", email: "a2@example.com", refresh_token: "rt2" },
          ],
        })
      );
      removeAccount("a1");
      const written = JSON.parse(fs.readFileSync(TEST_ACCOUNTS_FILE, "utf-8"));
      expect(written.accounts).toHaveLength(1);
      expect(written.accounts[0].account_id).toBe("a2");
    });

    it("does nothing when account not found", () => {
      fs.writeFileSync(
        TEST_ACCOUNTS_FILE,
        JSON.stringify({
          accounts: [{ account_id: "a1", email: "a1@example.com", refresh_token: "rt1" }],
        })
      );
      removeAccount("missing");
      const written = JSON.parse(fs.readFileSync(TEST_ACCOUNTS_FILE, "utf-8"));
      expect(written.accounts).toHaveLength(1);
    });
  });
});
