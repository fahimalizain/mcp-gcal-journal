#!/usr/bin/env node
import { google } from "googleapis";
import fs from "fs";
import http from "http";
import url from "url";
import open from "open";
import { CREDENTIALS_FILE, BASE_DIR } from "../config.js";
import { saveAccount } from "../store/accounts.js";

function readCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error(`Credentials file not found at ${CREDENTIALS_FILE}`);
    console.error("Please place your Google OAuth client_secret.json there.");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
  return raw.installed || raw.web;
}

async function runAuth() {
  const accountId = process.argv[2];
  if (!accountId) {
    console.error("Usage: npm run auth <account_id>");
    console.error("Example: npm run auth fahim-personal");
    process.exit(1);
  }

  const credentials = readCredentials();
  const port = parseInt(process.env.PORT || "3000", 10);
  const redirectUri = `http://localhost:${port}/oauth2callback`;

  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
    prompt: "consent",
  });

  console.log("Authorize this app by visiting this URL:");
  console.log(authUrl);
  try {
    await open(authUrl);
  } catch {
    // ignore if browser can't open
  }

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url) return;
      const qs = new url.URL(req.url, redirectUri).searchParams;
      const code = qs.get("code");
      const error = qs.get("error");
      if (code) {
        res.end("Authentication successful! You can close this tab.");
        server.close();
        (server as any).closeAllConnections?.();
        resolve(code);
      } else if (error) {
        res.end(`Authentication error: ${error}`);
        server.close();
        reject(new Error(error));
      }
    });
    server.listen(port, () => {
      console.log(`Listening for OAuth callback on port ${port}`);
    });
    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use.`);
        console.error("Set a different port with: PORT=3001 npm run auth <account_id>");
      }
      reject(err);
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const me = await calendar.calendarList.get({ calendarId: "primary" });
  const email = me.data.id || "unknown";

  saveAccount({
    account_id: accountId,
    email,
    refresh_token: tokens.refresh_token || "",
    access_token: tokens.access_token || undefined,
    expiry_date: tokens.expiry_date || undefined,
  });

  console.log(`Account "${accountId}" saved for ${email}`);
  process.exit(0);
}

runAuth().catch(console.error);
