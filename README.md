# mcp-gcal-journal

An MCP (Model Context Protocol) server for Google Calendar — a structured diary journal with multi-account, multi-calendar support, and auto-classification via a `preferences.json` matcher.

## Features

- **Multi-account** — Add multiple Google accounts (e.g., `work`, `personal`).
- **Multi-calendar** — List and target any calendar across any account.
- **Structured classification** — Every `create_event` and `update_event` call classifies the event summary against `preferences.json` to auto-assign categories and colors.
- **OAuth CLI** — Built-in `gcj-auth` CLI handles Google OAuth flow and stores tokens securely.
- **MCP stdio transport** — Works with any MCP client.

## Requirements

- Node.js v22+
- npm 10+
- Google OAuth client credentials (`client_secret.json`) from the [Google Cloud Console](https://console.cloud.google.com/)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Desktop** client.
3. Download the `client_secret.json` file.
4. Copy it to:

```bash
mkdir -p ~/.config/mcp-gcal-journal
cp /path/to/client_secret.json ~/.config/mcp-gcal-journal/credentials.json
```

### 3. Copy preferences.json

Copy your `preferences.json` to the same directory:

```bash
cp /path/to/preferences.json ~/.config/mcp-gcal-journal/preferences.json
```

The `preferences.json` defines category regex patterns and Google Calendar color IDs. See the existing example for structure.

### 4. Authenticate an account

```bash
npm run auth <account_id>
# or
node dist/auth/cli.js <account_id>
```

Example:

```bash
npm run auth personal
```

This will open your browser, complete the Google OAuth consent, and save the token.

Repeat for each account you want to add.

## Build

```bash
npm run build
```

## Start the MCP Server

```bash
npm start
# or
node dist/index.js
```

The server uses stdio transport, so it should be started by an MCP client (e.g., Claude Desktop, OpenCode, etc.).

## MCP Client Configuration

Add this to your MCP client configuration:

```json
{
  "mcpServers": {
    "gcal-journal": {
      "command": "node",
      "args": [
        "/path/to/mcp-gcal-journal/dist/index.js"
      ]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List all configured accounts |
| `list_calendars` | List calendars for a given account |
| `list_events` | List events in a calendar between `time_min` and `time_max` |
| `get_event` | Get a single event by ID |
| `create_event` | Create an event (summary is auto-classified) |
| `update_event` | Update an event (summary is re-classified if changed) |
| `delete_event` | Delete an event by ID |
| `classify_summary` | Classify a summary without creating an event |

Every tool that interacts with a calendar requires `account_id`.

## File Structure

```
~/.config/mcp-gcal-journal/
├── credentials.json      # Google OAuth client secrets
├── accounts.json         # Stored tokens per account
└── preferences.json      # Category regex patterns & color IDs
```

## Troubleshooting

- **Credentials file not found** — Ensure `~/.config/mcp-gcal-journal/credentials.json` exists.
- **Account not found** — Run the auth CLI first for that account ID.
- **Preferences file not found** — Ensure `preferences.json` is in the config directory.

## License

MIT
