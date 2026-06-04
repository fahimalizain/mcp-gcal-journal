import { describe, it, expect } from "vitest";
import os from "os";
import { BASE_DIR, ACCOUNTS_FILE, CREDENTIALS_FILE } from "../src/config.js";

describe("config", () => {
  it("exports BASE_DIR in user's home config directory", () => {
    const expected = `${os.homedir()}/.config/mcp-gcal-journal`;
    expect(BASE_DIR).toBe(expected);
  });

  it("exports ACCOUNTS_FILE inside BASE_DIR", () => {
    expect(ACCOUNTS_FILE).toBe(`${BASE_DIR}/accounts.json`);
  });

  it("exports CREDENTIALS_FILE inside BASE_DIR", () => {
    expect(CREDENTIALS_FILE).toBe(`${BASE_DIR}/credentials.json`);
  });
});
