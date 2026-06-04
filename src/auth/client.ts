import { google } from "googleapis";
import fs from "fs";
import { CREDENTIALS_FILE } from "../config.js";
import { Account, CalendarMeta } from "../store/types.js";
import { saveAccount } from "../store/accounts.js";

export function readCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    throw new Error(
      `Credentials file not found at ${CREDENTIALS_FILE}. Please download your Google OAuth client secrets JSON and save it there.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
  if (!raw.installed && !raw.web) {
    throw new Error(
      `Credentials file at ${CREDENTIALS_FILE} must contain either an "installed" or "web" client configuration.`
    );
  }
  return raw.installed || raw.web;
}

export async function getAuthClient(account: Account) {
  const credentials = readCredentials();
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    "http://localhost:3000/oauth2callback"
  );

  oauth2Client.setCredentials({
    refresh_token: account.refresh_token,
    access_token: account.access_token,
    expiry_date: account.expiry_date,
  });

  oauth2Client.on("tokens", (tokens) => {
    if (tokens.refresh_token) {
      account.refresh_token = tokens.refresh_token;
    }
    if (tokens.access_token) {
      account.access_token = tokens.access_token;
    }
    if (tokens.expiry_date) {
      account.expiry_date = tokens.expiry_date;
    }
    saveAccount(account);
  });

  return oauth2Client;
}

export async function getCalendarClient(account: Account) {
  const auth = await getAuthClient(account);
  return google.calendar({ version: "v3", auth });
}

export async function listCalendars(account: Account): Promise<CalendarMeta[]> {
  const client = await getCalendarClient(account);
  const res = await client.calendarList.list();
  const items = res.data.items || [];
  return items.map(i => ({
    id: i.id || "",
    summary: i.summary || "",
    primary: i.primary || false,
  }));
}

export async function refreshCalendars(account: Account): Promise<Account> {
  const calendars = await listCalendars(account);
  account.calendars = calendars;
  saveAccount(account);
  return account;
}
