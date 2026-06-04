import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Ajv } from "ajv";
import { getPreferencesFile } from "../config.js";
import { Preferences, CategoryNode } from "../classifier/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "classifier", "schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

export function loadPreferences(accountId: string): Preferences {
  const filePath = getPreferencesFile(accountId);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Preferences file not found at ${filePath}. Please create preferences_${accountId}.json.`
    );
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
  return data;
}

export function savePreferences(accountId: string, data: Preferences): void {
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors
      ?.map((err) => `${err.instancePath || "root"}: ${err.message}`)
      .join("\n  ");
    throw new Error(
      `Invalid preferences data:\n  ${errors || "Unknown validation error"}`
    );
  }
  const filePath = getPreferencesFile(accountId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function validatePreferences(data: Preferences): void {
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors
      ?.map((err) => `${err.instancePath || "root"}: ${err.message}`)
      .join("\n  ");
    throw new Error(
      `Invalid preferences data:\n  ${errors || "Unknown validation error"}`
    );
  }
}

export function getCategoryNode(
  prefs: Preferences,
  dotPath: string
): CategoryNode | null {
  if (!dotPath) return null;
  const parts = dotPath.split(".");
  let current: any = prefs.categories;
  for (let i = 0; i < parts.length; i++) {
    if (!current || typeof current !== "object") return null;
    current = current[parts[i]];
    if (current === undefined) return null;
    if (i < parts.length - 1) {
      current = current?.children;
    }
  }
  return current && typeof current === "object" ? (current as CategoryNode) : null;
}

export function setCategoryNode(
  prefs: Preferences,
  dotPath: string,
  node: CategoryNode
): void {
  if (dotPath === "") {
    throw new Error("Cannot set category at empty dot path");
  }
  const parts = dotPath.split(".");
  const name = parts[parts.length - 1];

  if (parts.length === 1) {
    if (prefs.categories[name]) {
      throw new Error(`Category "${dotPath}" already exists`);
    }
    prefs.categories[name] = node;
    return;
  }

  let parent: any = prefs.categories;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!parent || typeof parent !== "object") {
      throw new Error(
        `Parent path "${parts.slice(0, -1).join(".")}" does not exist`
      );
    }
    parent = parent[parts[i]];
    if (parent === undefined) {
      throw new Error(
        `Parent path "${parts.slice(0, -1).join(".")}" does not exist`
      );
    }
    if (i < parts.length - 2) {
      parent = parent?.children;
    }
  }

  if (!parent || typeof parent !== "object") {
    throw new Error(
      `Parent path "${parts.slice(0, -1).join(".")}" does not exist`
    );
  }

  if (parent.children && Object.hasOwn(parent.children, name)) {
    throw new Error(`Category "${dotPath}" already exists`);
  }

  if (!parent.children) {
    parent.children = {};
  }
  parent.children[name] = node;
}

export function removeCategoryNode(prefs: Preferences, dotPath: string): void {
  if (dotPath === "") {
    throw new Error("Cannot remove category at empty dot path");
  }
  const parts = dotPath.split(".");
  const name = parts[parts.length - 1];

  if (parts.length === 1) {
    if (!prefs.categories[name]) {
      throw new Error(`Category "${dotPath}" not found`);
    }
    delete prefs.categories[name];
    return;
  }

  let parent: any = prefs.categories;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!parent || typeof parent !== "object") {
      throw new Error(`Category "${dotPath}" not found`);
    }
    parent = parent[parts[i]];
    if (parent === undefined) {
      throw new Error(`Category "${dotPath}" not found`);
    }
    if (i < parts.length - 2) {
      parent = parent?.children;
    }
  }

  if (!parent || typeof parent !== "object") {
    throw new Error(`Category "${dotPath}" not found`);
  }

  if (!parent.children || !Object.hasOwn(parent.children, name)) {
    throw new Error(`Category "${dotPath}" not found`);
  }

  delete parent.children[name];
}

export function getCategoryList(prefs: Preferences): string[] {
  return Object.keys(prefs.categories);
}

export function getSummary(prefs: Preferences): any {
  const categories: Record<string, any> = {};
  for (const [key, node] of Object.entries(prefs.categories)) {
    const hasChildren =
      !!node.children && Object.keys(node.children).length > 0;
    categories[key] = {
      title: node.title,
      patternCount: node.patterns?.length ?? 0,
      color: node.color,
      googleCalendarColorId: node.googleCalendarColorId,
      is_productive: node.is_productive,
      hasChildren,
      childrenCount: hasChildren ? Object.keys(node.children!).length : 0,
    };
  }

  const summary: any = {
    untracked_category: prefs.untracked_category,
    categories,
  };

  if (prefs.sleep) {
    summary.sleep = prefs.sleep;
  }

  return summary;
}
