import path from "path";
import os from "os";

export const BASE_DIR = path.resolve(os.homedir(), ".config", "mcp-gcal-journal");
export const ACCOUNTS_FILE = path.join(BASE_DIR, "accounts.json");
export const CREDENTIALS_FILE = path.join(BASE_DIR, "credentials.json");
export const COLORS_CACHE_FILE = path.join(BASE_DIR, "google_calendar_color_ids.json");

export function getPreferencesFile(accountId: string): string {
  return path.join(BASE_DIR, `preferences_${accountId}.json`);
}
