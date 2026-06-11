import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";

vi.mock("../../src/config.js", () => ({
  getPreferencesFile: (accountId: string) => `/tmp/mcp-gcs-test-prefs/preferences_${accountId}.json`,
}));

const TEST_DIR = "/tmp/mcp-gcs-test-prefs";

const validPreferences = {
  untracked_category: "untracked",
  categories: {
    work: {
      title: "Work",
      color: "#4285F4",
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

describe("preferences manager", () => {
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
      const { loadPreferences } = await import("../../src/preferences/manager.js");
      expect(() => loadPreferences("test")).toThrow(/Preferences file not found/);
    });

    it("throws when preferences file contains invalid JSON", async () => {
      fs.writeFileSync(`${TEST_DIR}/preferences_test.json`, "not json");
      const { loadPreferences } = await import("../../src/preferences/manager.js");
      expect(() => loadPreferences("test")).toThrow();
    });

    it("throws when preferences fail schema validation", async () => {
      fs.writeFileSync(
        `${TEST_DIR}/preferences_test.json`,
        JSON.stringify({ untracked_category: "test" })
      );
      const { loadPreferences } = await import("../../src/preferences/manager.js");
      expect(() => loadPreferences("test")).toThrow(/Invalid preferences_test\.json/);
    });

    it("returns valid preferences", async () => {
      fs.writeFileSync(
        `${TEST_DIR}/preferences_test.json`,
        JSON.stringify(validPreferences)
      );
      const { loadPreferences } = await import("../../src/preferences/manager.js");
      const result = loadPreferences("test");
      expect(result.untracked_category).toBe("untracked");
      expect(result.categories.work.title).toBe("Work");
    });
  });

  describe("savePreferences", () => {
    it("saves valid preferences to file", async () => {
      const { savePreferences } = await import("../../src/preferences/manager.js");
      savePreferences("test", validPreferences as any);
      const saved = JSON.parse(fs.readFileSync(`${TEST_DIR}/preferences_test.json`, "utf-8"));
      expect(saved.untracked_category).toBe("untracked");
      expect(saved.categories.work.title).toBe("Work");
    });

    it("throws when data fails schema validation", async () => {
      const { savePreferences } = await import("../../src/preferences/manager.js");
      expect(() => savePreferences("test", { untracked_category: "test" } as any)).toThrow(
        /Invalid preferences data/
      );
    });
  });

  describe("getCategoryNode", () => {
    it("returns top-level category", async () => {
      const { getCategoryNode } = await import("../../src/preferences/manager.js");
      const result = getCategoryNode(validPreferences as any, "work");
      expect(result?.title).toBe("Work");
    });

    it("returns nested category", async () => {
      const { getCategoryNode } = await import("../../src/preferences/manager.js");
      const result = getCategoryNode(validPreferences as any, "work.deep_work");
      expect(result?.title).toBe("Deep Work");
    });

    it("returns null for non-existent category", async () => {
      const { getCategoryNode } = await import("../../src/preferences/manager.js");
      const result = getCategoryNode(validPreferences as any, "nonexistent");
      expect(result).toBeNull();
    });

    it("returns null for non-existent nested path", async () => {
      const { getCategoryNode } = await import("../../src/preferences/manager.js");
      const result = getCategoryNode(validPreferences as any, "work.nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("setCategoryNode", () => {
    it("adds top-level category", async () => {
      const { setCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      setCategoryNode(prefs, "new_cat", { title: "New Category", patterns: [] });
      expect(prefs.categories.new_cat.title).toBe("New Category");
    });

    it("adds nested category", async () => {
      const { setCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      setCategoryNode(prefs, "work.new_child", { title: "New Child", patterns: [] });
      expect(prefs.categories.work.children.new_child.title).toBe("New Child");
    });

    it("throws when parent does not exist", async () => {
      const { setCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      expect(() => setCategoryNode(prefs, "nonexistent.child", { title: "Child", patterns: [] })).toThrow(
        /Parent path "nonexistent" does not exist/
      );
    });

    it("throws when category already exists", async () => {
      const { setCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      expect(() => setCategoryNode(prefs, "work", { title: "Work", patterns: [] })).toThrow(
        /Category "work" already exists/
      );
    });

    it("throws when nested category already exists", async () => {
      const { setCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      expect(() => setCategoryNode(prefs, "work.deep_work", { title: "Deep Work", patterns: [] })).toThrow(
        /Category "work\.deep_work" already exists/
      );
    });

    it("throws on empty dot path", async () => {
      const { setCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      expect(() => setCategoryNode(prefs, "", { title: "Empty", patterns: [] })).toThrow(
        /Cannot set category at empty dot path/
      );
    });
  });

  describe("removeCategoryNode", () => {
    it("removes top-level category", async () => {
      const { removeCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      removeCategoryNode(prefs, "personal");
      expect(prefs.categories.personal).toBeUndefined();
    });

    it("removes nested category", async () => {
      const { removeCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      removeCategoryNode(prefs, "work.deep_work");
      expect(prefs.categories.work.children.deep_work).toBeUndefined();
    });

    it("throws when category does not exist", async () => {
      const { removeCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      expect(() => removeCategoryNode(prefs, "nonexistent")).toThrow(
        /Category "nonexistent" not found/
      );
    });

    it("throws on empty dot path", async () => {
      const { removeCategoryNode } = await import("../../src/preferences/manager.js");
      const prefs = JSON.parse(JSON.stringify(validPreferences)) as any;
      expect(() => removeCategoryNode(prefs, "")).toThrow(
        /Cannot remove category at empty dot path/
      );
    });
  });

  describe("getCategoryList", () => {
    it("returns top-level category names", async () => {
      const { getCategoryList } = await import("../../src/preferences/manager.js");
      const result = getCategoryList(validPreferences as any);
      expect(result).toContain("work");
      expect(result).toContain("personal");
      expect(result).toHaveLength(2);
    });
  });

  describe("getSummary", () => {
    it("returns summary with categories metadata", async () => {
      const { getSummary } = await import("../../src/preferences/manager.js");
      const result = getSummary(validPreferences as any);
      expect(result.untracked_category).toBe("untracked");
      expect(result.categories.work.title).toBe("Work");
      expect(result.categories.work.patternCount).toBe(2);
      expect(result.categories.work.hasChildren).toBe(true);
      expect(result.categories.work.childrenCount).toBe(1);
      expect(result.categories.personal.patternCount).toBe(1);
      expect(result.categories.personal.hasChildren).toBe(false);
      expect(result.categories.personal.childrenCount).toBe(0);
    });
  });

  describe("validatePreferences", () => {
    it("does not throw for valid preferences", async () => {
      const { validatePreferences } = await import("../../src/preferences/manager.js");
      expect(() => validatePreferences(validPreferences as any)).not.toThrow();
    });

    it("throws for invalid preferences", async () => {
      const { validatePreferences } = await import("../../src/preferences/manager.js");
      expect(() => validatePreferences({ untracked_category: "test" } as any)).toThrow(
        /Invalid preferences data/
      );
    });
  });
});
