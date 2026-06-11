import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { listAccounts, getAccount } from "../store/accounts.js";
import { getCalendarClient, refreshCalendars } from "../auth/client.js";
import { classify, classifyOrError } from "../classifier/index.js";
import { GoogleCalendarColorId, CategoryNode, Pattern } from "../classifier/types.js";
import {
  loadPreferences,
  savePreferences,
  getCategoryNode,
  setCategoryNode,
  removeCategoryNode,
  getCategoryList,
  getSummary,
} from "../preferences/manager.js";

const server = new Server(
  { name: "mcp-gcal-journal", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

function validateAccount(accountId: string) {
  const account = getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }
  return account;
}

interface EventBody {
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime: string };
  end?: { dateTime: string };
  colorId?: GoogleCalendarColorId;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_accounts",
        description: "List all configured Google accounts",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_calendars",
        description: "List calendars for an account",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
          },
          required: ["account_id"],
        },
      },
      {
        name: "list_events",
        description: "List events in a calendar for a date range",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string" },
            calendar_id: { type: "string" },
            time_min: { type: "string", description: "ISO datetime with offset" },
            time_max: { type: "string", description: "ISO datetime with offset" },
            max_results: { type: "number", default: 50 },
            q: { type: "string", description: "Free text search query (searches summary, description, location, attendees)" },
          },
          required: ["account_id", "calendar_id", "time_min", "time_max"],
        },
      },
      {
        name: "get_event",
        description: "Get a single event by ID",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string" },
            calendar_id: { type: "string" },
            event_id: { type: "string" },
          },
          required: ["account_id", "calendar_id", "event_id"],
        },
      },
      {
        name: "create_event",
        description: "Create an event. Summary is classified against account preferences to auto-assign color and calendar",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string" },
            calendar_id: { type: "string", description: "Optional — overrides the classified calendar" },
            summary: { type: "string" },
            description: { type: "string" },
            start: { type: "string", description: "ISO datetime" },
            end: { type: "string", description: "ISO datetime" },
            location: { type: "string" },
            color_id: { type: "string" },
          },
          required: ["account_id", "summary", "start", "end"],
        },
      },
      {
        name: "update_event",
        description: "Update an existing event",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string" },
            calendar_id: { type: "string" },
            event_id: { type: "string" },
            summary: { type: "string" },
            description: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
            location: { type: "string" },
            color_id: { type: "string" },
          },
          required: ["account_id", "calendar_id", "event_id"],
        },
      },
      {
        name: "delete_event",
        description: "Delete an event by ID",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string" },
            calendar_id: { type: "string" },
            event_id: { type: "string" },
          },
          required: ["account_id", "calendar_id", "event_id"],
        },
      },
      {
        name: "classify_summary",
        description: "Classify a summary against account-specific preferences without creating an event",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier for per-account preferences" },
            summary: { type: "string" },
          },
          required: ["account_id", "summary"],
        },
      },
      {
        name: "get_preferences",
        description: "Load and view preferences for an account",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
            view: {
              type: "string",
              enum: ["summary", "raw"],
              default: "summary",
              description: "View mode: summary or raw JSON",
            },
            category: { type: "string", description: "Optional dot path to a specific category branch" },
          },
          required: ["account_id"],
        },
      },
      {
        name: "get_category",
        description: "Get a category node by dot path",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
            category: { type: "string", description: "Dot path to the category" },
          },
          required: ["account_id", "category"],
        },
      },
      {
        name: "list_categories",
        description: "List top-level category names",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
          },
          required: ["account_id"],
        },
      },
      {
        name: "add_category",
        description: "Add a new category to preferences",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
            parent: { type: "string", description: "Optional dot path to parent category" },
            name: { type: "string", description: "Category key (snake_case, used in dot paths)" },
            title: { type: "string", description: "Human-readable display title" },
            color: { type: "string" },
            googleCalendarColorId: { type: "string" },
            is_productive: { type: "boolean" },
            calendarId: { type: "string" },
            patterns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  regex: { type: "string" },
                  calendarId: { type: "string" },
                },
                required: ["regex"],
              },
            },
          },
          required: ["account_id", "name", "title"],
        },
      },
      {
        name: "update_category",
        description: "Update an existing category",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
            category: { type: "string", description: "Dot path to the category" },
            title: { type: "string" },
            color: { type: "string" },
            googleCalendarColorId: { type: "string" },
            is_productive: { type: "boolean" },
            calendarId: { type: "string" },
            patterns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  regex: { type: "string" },
                  calendarId: { type: "string" },
                },
                required: ["regex"],
              },
            },
          },
          required: ["account_id", "category"],
        },
      },
      {
        name: "remove_category",
        description: "Remove a category by dot path",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
            category: { type: "string", description: "Dot path to the category" },
          },
          required: ["account_id", "category"],
        },
      },
      {
        name: "update_untracked_category",
        description: "Update the untracked category fallback",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
            category: { type: "string", description: "Untracked category name" },
          },
          required: ["account_id", "category"],
        },
      },
      {
        name: "update_sleep",
        description: "Update sleep settings",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
            sleep: {
              type: "object",
              properties: {
                category: { type: "string" },
                daily_sleep_hours: { type: "number" },
                start_marker: { type: "string" },
                end_marker: { type: "string" },
              },
              required: ["category", "daily_sleep_hours", "start_marker", "end_marker"],
            },
          },
          required: ["account_id", "sleep"],
        },
      },
      {
        name: "validate_preferences",
        description: "Validate preferences for an account",
        inputSchema: {
          type: "object",
          properties: {
            account_id: { type: "string", description: "Account identifier" },
          },
          required: ["account_id"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs || {};

  try {
    if (name === "list_accounts") {
      const accounts = listAccounts();
      return {
        content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }],
      };
    }

    if (name === "list_calendars") {
      const account = validateAccount(args.account_id as string);
      const updated = await refreshCalendars(account);
      return {
        content: [{ type: "text", text: JSON.stringify(updated.calendars, null, 2) }],
      };
    }

    if (name === "list_events") {
      const account = validateAccount(args.account_id as string);
      const client = await getCalendarClient(account);
      const res = await client.events.list({
        calendarId: args.calendar_id as string,
        timeMin: args.time_min as string,
        timeMax: args.time_max as string,
        maxResults: (args.max_results as number) || 50,
        q: (args.q as string) || undefined,
        singleEvents: true,
        orderBy: "startTime",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data.items, null, 2) }],
      };
    }

    if (name === "get_event") {
      const account = validateAccount(args.account_id as string);
      const client = await getCalendarClient(account);
      const res = await client.events.get({
        calendarId: args.calendar_id as string,
        eventId: args.event_id as string,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    }

    if (name === "create_event") {
      const account = validateAccount(args.account_id as string);
      const summary = args.summary as string;
      const classification = classifyOrError(summary, args.account_id as string);
      const client = await getCalendarClient(account);
      const calendarId = (args.calendar_id as string) || classification.calendarId || "primary";
      const res = await client.events.insert({
        calendarId,
        requestBody: {
          summary,
          description: (args.description as string) || undefined,
          location: (args.location as string) || undefined,
          start: { dateTime: args.start as string },
          end: { dateTime: args.end as string },
          colorId: (args.color_id as string) || classification.googleCalendarColorId || undefined,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify({
          event: res.data,
          classification,
        }, null, 2) }],
      };
    }

    if (name === "update_event") {
      const account = validateAccount(args.account_id as string);
      const client = await getCalendarClient(account);
      const body: EventBody = {};
      if (args.summary) body.summary = args.summary as string;
      if (args.description) body.description = args.description as string;
      if (args.location) body.location = args.location as string;
      if (args.start) body.start = { dateTime: args.start as string };
      if (args.end) body.end = { dateTime: args.end as string };
      if (args.color_id) body.colorId = args.color_id as GoogleCalendarColorId;
      if (args.summary) {
        const classification = classifyOrError(args.summary as string, args.account_id as string);
        if (!body.colorId && classification.googleCalendarColorId) {
          body.colorId = classification.googleCalendarColorId;
        }
      }
      const res = await client.events.patch({
        calendarId: args.calendar_id as string,
        eventId: args.event_id as string,
        requestBody: body,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    }

    if (name === "delete_event") {
      const account = validateAccount(args.account_id as string);
      const client = await getCalendarClient(account);
      await client.events.delete({
        calendarId: args.calendar_id as string,
        eventId: args.event_id as string,
      });
      return {
        content: [{ type: "text", text: "Event deleted successfully" }],
      };
    }

    if (name === "classify_summary") {
      const result = classify(args.summary as string, args.account_id as string);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    if (name === "get_preferences") {
      const prefs = loadPreferences(args.account_id as string);
      if (args.category) {
        const node = getCategoryNode(prefs, args.category as string);
        if (!node) {
          throw new Error(`Category "${args.category}" not found`);
        }
        return {
          content: [{ type: "text", text: JSON.stringify(node, null, 2) }],
        };
      }
      const view = (args.view as string) || "summary";
      const result = view === "raw" ? prefs : getSummary(prefs);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    if (name === "get_category") {
      const prefs = loadPreferences(args.account_id as string);
      const node = getCategoryNode(prefs, args.category as string);
      if (!node) {
        throw new Error(`Category "${args.category}" not found`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(node, null, 2) }],
      };
    }

    if (name === "list_categories") {
      const prefs = loadPreferences(args.account_id as string);
      const categories = getCategoryList(prefs);
      return {
        content: [{ type: "text", text: JSON.stringify(categories, null, 2) }],
      };
    }

    if (name === "add_category") {
      const prefs = loadPreferences(args.account_id as string);
      const node: CategoryNode = { title: args.title as string };
      if (args.color !== undefined) node.color = args.color as string;
      if (args.googleCalendarColorId !== undefined) node.googleCalendarColorId = args.googleCalendarColorId as GoogleCalendarColorId;
      if (args.is_productive !== undefined) node.is_productive = args.is_productive as boolean;
      if (args.calendarId !== undefined) node.calendarId = args.calendarId as string;
      if (args.patterns !== undefined) node.patterns = args.patterns as Pattern[];
      const parent = (args.parent as string) || "";
      const dotPath = parent ? `${parent}.${args.name}` : (args.name as string);
      setCategoryNode(prefs, dotPath, node);
      savePreferences(args.account_id as string, prefs);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, added: dotPath }, null, 2) }],
      };
    }

    if (name === "update_category") {
      const prefs = loadPreferences(args.account_id as string);
      const node = getCategoryNode(prefs, args.category as string);
      if (!node) {
        throw new Error(`Category "${args.category}" not found`);
      }
      if (args.title !== undefined) node.title = args.title as string;
      if (args.color !== undefined) node.color = args.color as string;
      if (args.googleCalendarColorId !== undefined) node.googleCalendarColorId = args.googleCalendarColorId as GoogleCalendarColorId;
      if (args.is_productive !== undefined) node.is_productive = args.is_productive as boolean;
      if (args.calendarId !== undefined) node.calendarId = args.calendarId as string;
      if (args.patterns !== undefined) node.patterns = args.patterns as Pattern[];
      savePreferences(args.account_id as string, prefs);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, updated: args.category }, null, 2) }],
      };
    }

    if (name === "remove_category") {
      const prefs = loadPreferences(args.account_id as string);
      removeCategoryNode(prefs, args.category as string);
      savePreferences(args.account_id as string, prefs);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, removed: args.category }, null, 2) }],
      };
    }

    if (name === "update_untracked_category") {
      const prefs = loadPreferences(args.account_id as string);
      prefs.untracked_category = args.category as string;
      savePreferences(args.account_id as string, prefs);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, untracked_category: args.category }, null, 2) }],
      };
    }

    if (name === "update_sleep") {
      const prefs = loadPreferences(args.account_id as string);
      prefs.sleep = args.sleep as {
        category: string;
        daily_sleep_hours: number;
        start_marker: string;
        end_marker: string;
      };
      savePreferences(args.account_id as string, prefs);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, sleep: args.sleep }, null, 2) }],
      };
    }

    if (name === "validate_preferences") {
      loadPreferences(args.account_id as string);
      return {
        content: [{ type: "text", text: JSON.stringify({ valid: true, message: "Preferences are valid" }, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

export async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Google Calendar Structured server running on stdio");
}
