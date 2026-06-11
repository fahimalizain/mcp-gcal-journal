import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { readCredentials } from "../../src/auth/client.js";

vi.mock("../../src/config.js", () => ({
  BASE_DIR: "/tmp/mcp-gcs-test-auth",
  CREDENTIALS_FILE: "/tmp/mcp-gcs-test-auth/credentials.json",
  COLORS_CACHE_FILE: "/tmp/mcp-gcs-test-auth/google_calendar_color_ids.json",
}));

const TEST_DIR = "/tmp/mcp-gcs-test-auth";
const TEST_CREDENTIALS_FILE = "/tmp/mcp-gcs-test-auth/credentials.json";
const TEST_COLORS_CACHE_FILE = "/tmp/mcp-gcs-test-auth/google_calendar_color_ids.json";

const mockColorsGet = vi.hoisted(() => vi.fn());

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function () {
        return {
          setCredentials: vi.fn(),
          on: vi.fn(),
        };
      }),
    },
    calendar: vi.fn(() => ({
      colors: { get: mockColorsGet },
    })),
  },
}));

vi.mock("../../src/store/accounts.js", () => ({
  saveAccount: vi.fn(),
}));

const testAccount = {
  id: "test",
  refresh_token: "rt",
  access_token: "at",
  expiry_date: Date.now() + 3600000,
  calendars: [],
};

describe("auth/client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
    mockColorsGet.mockResolvedValue({
      data: {
        event: {
          "1": { background: "#a4bdfc" },
          "2": { background: "#7ae7bf" },
        },
      },
    });
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

  describe("fetchEventColors", () => {
    beforeEach(() => {
      fs.writeFileSync(
        TEST_CREDENTIALS_FILE,
        JSON.stringify({
          installed: { client_id: "cid", client_secret: "cs" },
        })
      );
    });

    it("reads from cache when file is fresh", async () => {
      fs.writeFileSync(TEST_COLORS_CACHE_FILE, JSON.stringify({ "1": "#cached", "2": "#also" }));
      const past = Date.now() - 1000;
      fs.utimesSync(TEST_COLORS_CACHE_FILE, past / 1000, past / 1000);

      const { fetchEventColors } = await import("../../src/auth/client.js");
      const palette = await fetchEventColors(testAccount);

      expect(mockColorsGet).not.toHaveBeenCalled();
      expect(palette.get(1)).toBe("#cached");
      expect(palette.get(2)).toBe("#also");
    });

    it("fetches from API and writes cache when cache is stale", async () => {
      fs.writeFileSync(TEST_COLORS_CACHE_FILE, JSON.stringify({ "1": "#stale" }));
      const stale = Date.now() - 7 * 60 * 60 * 1000;
      fs.utimesSync(TEST_COLORS_CACHE_FILE, stale / 1000, stale / 1000);

      const { fetchEventColors } = await import("../../src/auth/client.js");
      const palette = await fetchEventColors(testAccount);

      expect(mockColorsGet).toHaveBeenCalled();
      expect(palette.get(1)).toBe("#a4bdfc");
      expect(palette.get(2)).toBe("#7ae7bf");
      const written = JSON.parse(fs.readFileSync(TEST_COLORS_CACHE_FILE, "utf-8"));
      expect(written["1"]).toBe("#a4bdfc");
      expect(written["2"]).toBe("#7ae7bf");
    });

    it("fetches from API and creates cache when no cache file exists", async () => {
      const { fetchEventColors } = await import("../../src/auth/client.js");
      const palette = await fetchEventColors(testAccount);

      expect(mockColorsGet).toHaveBeenCalled();
      expect(palette.get(1)).toBe("#a4bdfc");
      expect(fs.existsSync(TEST_COLORS_CACHE_FILE)).toBe(true);
      const written = JSON.parse(fs.readFileSync(TEST_COLORS_CACHE_FILE, "utf-8"));
      expect(written["1"]).toBe("#a4bdfc");
    });
  });
});
