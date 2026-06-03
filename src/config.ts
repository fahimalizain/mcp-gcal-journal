import path from "path";
import os from "os";

export const BASE_DIR = path.resolve(os.homedir(), ".config", "mcp-google-calendar-structured");
export const ACCOUNTS_FILE = path.join(BASE_DIR, "accounts.json");
export const PREFERENCES_FILE = path.join(BASE_DIR, "preferences.json");
export const CREDENTIALS_FILE = path.join(BASE_DIR, "credentials.json");
