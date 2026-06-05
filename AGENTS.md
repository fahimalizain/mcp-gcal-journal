# Agent Context: mcp-gcal-journal

An MCP (Model Context Protocol) server for Google Calendar. It provides structured diary journal tooling with multi-account, multi-calendar support, and auto-classification via per-account preferences (regex patterns → categories/colors/calendars).

## Build & Run

- **TypeScript**, ESM (`"type": "module"`), Node 16 module resolution.
- **Build**: `npm run build` (runs `tsc`). Output goes to `dist/`.
- **Dev watch**: `npm run dev` (runs `tsc --watch`).
- **Start server**: `npm start` (runs `node dist/index.js`). Uses stdio transport — must be launched by an MCP client (Claude Desktop, OpenCode, etc.).
- **Auth CLI**: `npm run auth <account_id>` (runs `node dist/auth/cli.js`). Completes Google OAuth flow and stores the token.

## Testing

- **Test runner**: Vitest (`vitest.config.ts` uses `globals: true`, `environment: "node"`).
- **Run tests**: `npm test` (one-shot) or `npm run test:watch`.
- **Test conventions**:
  - Tests live in `tests/` mirroring `src/` structure.
  - Mock external modules with `vi.mock()`.
  - Mock `config.js` paths to `/tmp/...` so tests never touch real `~/.config/mcp-gcal-journal/`.
  - Use dynamic `import()` after `vi.resetModules()` when testing modules that read files on load (e.g., classifier).
  - `beforeEach` / `afterEach` clean up temp files.

## Architecture

```
src/
  index.ts              # Entry point: startServer()
  server/index.ts       # MCP server (stdio transport), tool definitions & handlers
  config.ts             # Base paths: ~/.config/mcp-gcal-journal/
  auth/
    cli.ts              # OAuth CLI flow (opens browser, captures code, saves account)
    client.ts           # Google API auth client, calendar client, calendar list refresh
  store/
    types.ts            # Account, CalendarMeta, AccountsStore interfaces
    accounts.ts         # Read/write accounts.json (simple JSON file store)
  classifier/
    types.ts            # Preferences, CategoryNode, Pattern, ClassificationResult
    schema.json         # JSON Schema for preferences validation (AJV)
    index.ts            # loadPreferences, classify, classifyOrError, getCategoryList
  preferences/
    manager.ts          # load/save/validate preferences, dot-path navigation (get/set/remove CategoryNode)
```

## Key Conventions

- **ESM imports**: All internal imports must use `.js` extensions (e.g., `import { x } from "../config.js"`).
- **TypeScript strict mode**: `strict: true`. No implicit any.
- **Node16 module resolution**: `module: "Node16"`, `moduleResolution: "Node16"`.
- **Source maps & declarations**: Generated in `dist/`.
- **Error handling in server handlers**: Catch errors and return `{ content: [{ type: "text", text: "Error: ..." }], isError: true }`. Never throw unhandled from MCP tool handlers.

## File-Based Storage

All runtime state lives in `~/.config/mcp-gcal-journal/`:
- `credentials.json` — Google OAuth client secrets (user must provide).
- `accounts.json` — tokens and calendar metadata per account.
- `preferences_<account_id>.json` — per-account category tree with regex patterns.

## Preferences & Classification

- Preferences are a tree of `CategoryNode`s under `categories`. Each node can have `patterns` (regex strings, case-insensitive) and optional `children` (nested subcategories).
- `classify(summary, accountId)` walks the tree, matches the first regex, and returns `category`, `subcategory`, `color`, `googleCalendarColorId`, `calendarId`, `is_productive`.
- If nothing matches, falls back to `untracked_category`.
- `loadPreferences` caches by `mtimeMs` and validates against `schema.json` via AJV.
- `preferences/manager.ts` provides dot-path navigation (`work.deep_work`) for CRUD operations.

## When Adding or Changing Tools

1. Add the tool definition to `ListToolsRequestSchema` handler in `src/server/index.ts`.
2. Add the handler branch in `CallToolRequestSchema` handler.
3. Always validate `account_id` with `validateAccount()` before calling Google API.
4. Return JSON stringified results as `{ content: [{ type: "text", text: ... }] }`.
5. Add tests in `tests/server/index.test.ts` (mock the new dependencies if needed).
6. Run `npm test` before committing.
