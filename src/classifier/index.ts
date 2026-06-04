import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Ajv } from "ajv";
import { PREFERENCES_FILE } from "../config.js";
import { Preferences, ClassificationResult, CategoryNode } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

let cached: Preferences | null = null;
let cachedMtime = 0;

export function loadPreferences(): Preferences {
  if (!fs.existsSync(PREFERENCES_FILE)) {
    throw new Error(
      `Preferences file not found at ${PREFERENCES_FILE}. Please copy your preferences.json there.`
    );
  }
  const stat = fs.statSync(PREFERENCES_FILE);
  if (cached && stat.mtimeMs === cachedMtime) {
    return cached;
  }
  const data = JSON.parse(fs.readFileSync(PREFERENCES_FILE, "utf-8")) as Preferences;
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors
      ?.map((err) => `${err.instancePath || "root"}: ${err.message}`)
      .join("\n  ");
    throw new Error(
      `Invalid preferences.json:\n  ${errors || "Unknown validation error"}`
    );
  }
  cached = data;
  cachedMtime = stat.mtimeMs;
  return data;
}

function matchPatterns(text: string, patterns?: { regex: string; calendarId?: string }[]): { regex: string; calendarId?: string } | null {
  if (!patterns) return null;
  for (const p of patterns) {
    try {
      if (new RegExp(p.regex, "i").test(text)) {
        return p;
      }
    } catch (e) {
      console.error(`Invalid regex pattern in preferences: ${p.regex}`);
    }
  }
  return null;
}

function searchNode(
  text: string,
  name: string,
  node: CategoryNode,
  parent?: CategoryNode
): ClassificationResult | null {
  const matchedPattern = matchPatterns(text, node.patterns);
  if (matchedPattern) {
    return {
      category: name,
      color: node.color ?? parent?.color,
      googleCalendarColorId: node.googleCalendarColorId ?? parent?.googleCalendarColorId,
      calendarId: matchedPattern.calendarId ?? node.calendarId ?? parent?.calendarId,
      is_productive: node.is_productive ?? parent?.is_productive,
    };
  }
  if (node.children) {
    for (const [childName, childNode] of Object.entries(node.children)) {
      const result = searchNode(text, childName, childNode, node);
      if (result) {
        return { ...result, category: name, subcategory: childName };
      }
    }
  }
  return null;
}

export function classify(summary: string): ClassificationResult {
  const prefs = loadPreferences();
  for (const [name, node] of Object.entries(prefs.categories)) {
    const result = searchNode(summary, name, node);
    if (result) return result;
  }
  return {
    category: prefs.untracked_category || "untracked",
    color: undefined,
    googleCalendarColorId: undefined,
    calendarId: undefined,
  };
}

export function classifyOrError(summary: string): ClassificationResult {
  const prefs = loadPreferences();
  for (const [name, node] of Object.entries(prefs.categories)) {
    const result = searchNode(summary, name, node);
    if (result) return result;
  }
  throw new Error(
    `Event summary "${summary}" does not match any category in preferences.json. ` +
    `Please clarify or update the preferences to include this event type.`
  );
}

export function getCategoryList(): string[] {
  const prefs = loadPreferences();
  return Object.keys(prefs.categories);
}
