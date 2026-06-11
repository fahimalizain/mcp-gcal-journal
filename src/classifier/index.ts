import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Ajv } from "ajv";
import { getPreferencesFile } from "../config.js";
import { Preferences, ClassificationResult, CategoryNode } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const cache = new Map<string, { data: Preferences; mtime: number }>();

export function loadPreferences(accountId: string): Preferences {
  const filePath = getPreferencesFile(accountId);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Preferences file not found at ${filePath}. Please create preferences_${accountId}.json.`
    );
  }
  const stat = fs.statSync(filePath);
  const cached = cache.get(filePath);
  if (cached && stat.mtimeMs === cached.mtime) {
    return cached.data;
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Preferences;
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors
      ?.map((err) => `${err.instancePath || "root"}: ${err.message}`)
      .join("\n  ");
    throw new Error(
      `Invalid preferences_${accountId}.json:\n  ${errors || "Unknown validation error"}`
    );
  }
  cache.set(filePath, { data, mtime: stat.mtimeMs });
  return data;
}

function matchPatterns(text: string, patterns?: { regex: string; calendarId?: string }[]): { regex: string; calendarId?: string } | null {
  if (!patterns) return null;
  for (const p of patterns) {
    try {
      if (new RegExp(p.regex).test(text)) {
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

export function classify(summary: string, accountId: string): ClassificationResult {
  const prefs = loadPreferences(accountId);
  for (const [name, node] of Object.entries(prefs.categories)) {
    const result = searchNode(summary, name, node);
    if (result) return result;
  }
  return {
    category: prefs.untracked_category || "untracked",
    color: undefined,
    calendarId: undefined,
  };
}

export function classifyOrError(summary: string, accountId: string): ClassificationResult {
  const prefs = loadPreferences(accountId);
  for (const [name, node] of Object.entries(prefs.categories)) {
    const result = searchNode(summary, name, node);
    if (result) return result;
  }
  throw new Error(
    `Event summary "${summary}" does not match any category in preferences_${accountId}.json. ` +
    `Please clarify or update the preferences to include this event type.`
  );
}

export function getCategoryList(accountId: string): string[] {
  const prefs = loadPreferences(accountId);
  return Object.keys(prefs.categories);
}
