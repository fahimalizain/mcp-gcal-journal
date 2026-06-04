import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("../../src/config.js", () => ({
  PREFERENCES_FILE: "/tmp/mcp-gcs-test-classifier/preferences.json",
}));

const TEST_DIR = "/tmp/mcp-gcs-test-classifier";
const TEST_PREFERENCES_FILE = "/tmp/mcp-gcs-test-classifier/preferences.json";

const validPreferences = {
  untracked_category: "untracked",
  categories: {
    work: {
      title: "Work",
      color: "#4285F4",
      googleCalendarColorId: "1",
      patterns: [{ regex: "meeting" }, { regex: "standup" }],
      children: {
        deep_work: {
          title: "Deep Work",
          color: "#34A853",
          patterns: [{ regex: "focus", calendarId: "deep@cal" }],
        },
      },
    },
    personal: {
      title: "Personal",
      patterns: [{ regex: "gym|workout" }],
    },
  },
};

describe("classifier", () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("loadPreferences", () => {
    it("throws when preferences file does not exist", async () => {
      const { loadPreferences } = await import("../../src/classifier/index.js");
      expect(() => loadPreferences()).toThrow(/Preferences file not found/);
    });

    it("throws when preferences file contains invalid JSON", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, "not json");
      const { loadPreferences } = await import("../../src/classifier/index.js");
      expect(() => loadPreferences()).toThrow();
    });

    it("throws when preferences fail schema validation", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify({ untracked_category: "test" }));
      const { loadPreferences } = await import("../../src/classifier/index.js");
      expect(() => loadPreferences()).toThrow(/Invalid preferences\.json/);
    });

    it("returns valid preferences", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { loadPreferences } = await import("../../src/classifier/index.js");
      const result = loadPreferences();
      expect(result.untracked_category).toBe("untracked");
      expect(result.categories.work.title).toBe("Work");
    });

    it("caches preferences when mtime unchanged", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { loadPreferences } = await import("../../src/classifier/index.js");
      const first = loadPreferences();
      const second = loadPreferences();
      expect(second).toBe(first);
    });

    it("reloads preferences when mtime changes", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { loadPreferences } = await import("../../src/classifier/index.js");
      const first = loadPreferences();
      // Wait a moment then rewrite the file to change mtime
      await new Promise((r) => setTimeout(r, 10));
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const second = loadPreferences();
      expect(second).toBeDefined();
      expect(second.categories.work.title).toBe("Work");
    });
  });

  describe("classify", () => {
    it("matches top-level patterns", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { classify } = await import("../../src/classifier/index.js");
      const result = classify("team meeting");
      expect(result.category).toBe("work");
      expect(result.color).toBe("#4285F4");
      expect(result.googleCalendarColorId).toBe("1");
    });

    it("matches child patterns with subcategory", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { classify } = await import("../../src/classifier/index.js");
      const result = classify("focus time");
      expect(result.category).toBe("work");
      expect(result.subcategory).toBe("deep_work");
      expect(result.color).toBe("#34A853");
      expect(result.calendarId).toBe("deep@cal");
    });

    it("is case insensitive", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { classify } = await import("../../src/classifier/index.js");
      const result = classify("MEETING with boss");
      expect(result.category).toBe("work");
    });

    it("returns untracked when no match", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { classify } = await import("../../src/classifier/index.js");
      const result = classify("random event");
      expect(result.category).toBe("untracked");
      expect(result.color).toBeUndefined();
    });

    it("matches alternate regex patterns", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { classify } = await import("../../src/classifier/index.js");
      const result = classify("morning workout");
      expect(result.category).toBe("personal");
    });
  });

  describe("classifyOrError", () => {
    it("returns result when matched", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { classifyOrError } = await import("../../src/classifier/index.js");
      const result = classifyOrError("standup");
      expect(result.category).toBe("work");
    });

    it("throws when no match", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { classifyOrError } = await import("../../src/classifier/index.js");
      expect(() => classifyOrError("unknown event")).toThrow(/does not match any category/);
    });
  });

  describe("getCategoryList", () => {
    it("returns list of top-level category names", async () => {
      fs.writeFileSync(TEST_PREFERENCES_FILE, JSON.stringify(validPreferences));
      const { getCategoryList } = await import("../../src/classifier/index.js");
      const result = getCategoryList();
      expect(result).toContain("work");
      expect(result).toContain("personal");
      expect(result).toHaveLength(2);
    });
  });
});
