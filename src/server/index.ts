import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { listAccounts, getAccount } from "../store/accounts.js";
import { getCalendarClient, refreshCalendars } from "../auth/client.js";
import { classifyOrError, classify } from "../classifier/index.js";
import { GoogleCalendarColorId } from "../classifier/types.js";

const server = new Server(
  { name: "mcp-google-calendar-structured", version: "1.0.0" },
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
        description: "Create an event. Summary is classified against preferences.json to auto-assign color and calendar",
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
        description: "Classify a summary against preferences.json without creating an event",
        inputSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
          },
          required: ["summary"],
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
      const classification = classifyOrError(summary);
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
        const classification = classifyOrError(args.summary as string);
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
      const result = classify(args.summary as string);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
