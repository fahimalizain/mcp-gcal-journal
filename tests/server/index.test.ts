import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Mock the MCP SDK before importing the server module
vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn(function () {
    this.setRequestHandler = vi.fn();
    this.connect = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(function () {}),
}));

vi.mock("@modelcontextprotocol/sdk/types.js", async () => {
  const actual = await vi.importActual<typeof import("@modelcontextprotocol/sdk/types.js")>(
    "@modelcontextprotocol/sdk/types.js"
  );
  return {
    ...actual,
    CallToolRequestSchema: actual.CallToolRequestSchema,
    ListToolsRequestSchema: actual.ListToolsRequestSchema,
  };
});

vi.mock("../../src/store/accounts.js", () => ({
  listAccounts: vi.fn(),
  getAccount: vi.fn(),
}));

const mockEventColorsPalette = {
  data: {
    event: {
      "1": { background: "#a4bdfc" },
      "2": { background: "#7ae7bf" },
      "3": { background: "#dbadff" },
      "4": { background: "#ff887c" },
      "5": { background: "#fbd75b" },
      "6": { background: "#ffb878" },
      "7": { background: "#46d6db" },
      "8": { background: "#e1e1e1" },
      "9": { background: "#5484ed" },
      "10": { background: "#51b749" },
      "11": { background: "#dc2127" },
    },
  },
};

const { getCalendarClient, refreshCalendars } = vi.hoisted(() => ({
  getCalendarClient: vi.fn(),
  refreshCalendars: vi.fn(),
}));

vi.mock("../../src/auth/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/auth/client.js")>();
  return {
    ...actual,
    getCalendarClient,
    refreshCalendars,
    fetchEventColors: async (account: Parameters<typeof actual.fetchEventColors>[0]) => {
      const client = await getCalendarClient(account);
      const res = await client.colors.get({});
      const eventColors = res.data.event || {};
      const palette = new Map<number, string>();
      for (const [id, colorDef] of Object.entries(eventColors)) {
        palette.set(parseInt(id), (colorDef as { background: string }).background);
      }
      return palette;
    },
  };
});

vi.mock("../../src/classifier/index.js", () => ({
  classify: vi.fn(),
  classifyOrError: vi.fn(),
}));

import { getAccount } from "../../src/store/accounts.js";
import { classify, classifyOrError } from "../../src/classifier/index.js";
import { closestGoogleColorId } from "../../src/auth/client.js";

function paletteFromMockColors(): Map<number, string> {
  const palette = new Map<number, string>();
  for (const [id, colorDef] of Object.entries(mockEventColorsPalette.data.event)) {
    palette.set(parseInt(id), colorDef.background);
  }
  return palette;
}

function withColorsMock(events: Record<string, unknown>) {
  return {
    events,
    colors: { get: vi.fn().mockResolvedValue(mockEventColorsPalette) },
  };
}
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

describe("server/index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Note: The server module creates a Server instance on import. We can test
  // the mocked functions that the handlers call indirectly, but since the
  // handlers are registered inside the module and not exported, we verify
  // behavior through the mocked dependencies.

  it("getAccount mock is available for validation", () => {
    const mockAccount = {
      account_id: "test",
      email: "test@example.com",
      refresh_token: "rt",
    };
    vi.mocked(getAccount).mockReturnValue(mockAccount);
    expect(getAccount("test")).toBe(mockAccount);
  });

  it("classify mock returns configured results", () => {
    const mockResult = {
      category: "work",
      color: "#4285F4",
    };
    vi.mocked(classify).mockReturnValue(mockResult);
    expect(classify("meeting", "test")).toEqual(mockResult);
  });

  it("getCalendarClient mock resolves", async () => {
    const mockClient = withColorsMock({ list: vi.fn() });
    vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
    const result = await getCalendarClient({ account_id: "a", email: "e", refresh_token: "rt" });
    expect(result).toBe(mockClient);
  });

  it("list_events passes q parameter to the calendar API", async () => {
    const mockAccount = {
      account_id: "test",
      email: "test@example.com",
      refresh_token: "rt",
    };
    vi.mocked(getAccount).mockReturnValue(mockAccount);

    const listFn = vi.fn().mockResolvedValue({ data: { items: [] } });
    const mockClient = withColorsMock({ list: listFn });
    vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);

    // Re-import the server module so its import-time code runs with the
    // current mocks (the module registers handlers on Server on import).
    vi.resetModules();
    const { startServer } = await import("../../src/server/index.js");
    await startServer();

    // The Server mock was instantiated with setRequestHandler. The second
    // call (index 1) is the CallToolRequestSchema handler.
    const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
    const callToolHandler = setRequestHandler.mock.calls[1][1];

    const request = {
      params: {
        name: "list_events",
        arguments: {
          account_id: "test",
          calendar_id: "primary",
          time_min: "2024-01-01T00:00:00Z",
          time_max: "2024-01-02T00:00:00Z",
          q: "meeting",
        },
      },
    };

    await callToolHandler(request);

    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        timeMin: "2024-01-01T00:00:00Z",
        timeMax: "2024-01-02T00:00:00Z",
        q: "meeting",
      })
    );
  });

  it("list_events works without q parameter", async () => {
    const mockAccount = {
      account_id: "test",
      email: "test@example.com",
      refresh_token: "rt",
    };
    vi.mocked(getAccount).mockReturnValue(mockAccount);

    const listFn = vi.fn().mockResolvedValue({ data: { items: [] } });
    const mockClient = withColorsMock({ list: listFn });
    vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);

    vi.resetModules();
    const { startServer } = await import("../../src/server/index.js");
    await startServer();

    const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
    const callToolHandler = setRequestHandler.mock.calls[1][1];

    const request = {
      params: {
        name: "list_events",
        arguments: {
          account_id: "test",
          calendar_id: "primary",
          time_min: "2024-01-01T00:00:00Z",
          time_max: "2024-01-02T00:00:00Z",
        },
      },
    };

    await callToolHandler(request);

    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        timeMin: "2024-01-01T00:00:00Z",
        timeMax: "2024-01-02T00:00:00Z",
        q: undefined,
      })
    );
  });

  describe("create_event", () => {
    it("creates event with classified summary", async () => {
      const mockAccount = { account_id: "test", email: "test@example.com", refresh_token: "rt" };
      vi.mocked(getAccount).mockReturnValue(mockAccount);
      const insertFn = vi.fn().mockResolvedValue({ data: { id: "evt_123", summary: "Meeting" } });
      const mockClient = withColorsMock({ insert: insertFn });
      vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
      vi.mocked(classifyOrError).mockReturnValue({
        category: "work", color: "#4285F4", calendarId: "work@cal", is_productive: true,
      });
      vi.resetModules();
      const { startServer } = await import("../../src/server/index.js");
      await startServer();
      const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
      const callToolHandler = setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "create_event",
          arguments: {
            account_id: "test",
            summary: "team meeting",
            start: "2024-06-01T09:00:00+05:30",
            end: "2024-06-01T10:00:00+05:30",
          },
        },
      });

      expect(classifyOrError).toHaveBeenCalledWith("team meeting", "test");
      expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
        calendarId: "work@cal",
        requestBody: expect.objectContaining({
          summary: "team meeting",
          colorId: closestGoogleColorId("#4285F4", paletteFromMockColors()),
          start: { dateTime: "2024-06-01T09:00:00+05:30" },
          end: { dateTime: "2024-06-01T10:00:00+05:30" },
        }),
      }));
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.classification.category).toBe("work");
    });

    it("creates event with explicit calendar_id override", async () => {
      const mockAccount = { account_id: "test", email: "test@example.com", refresh_token: "rt" };
      vi.mocked(getAccount).mockReturnValue(mockAccount);
      const insertFn = vi.fn().mockResolvedValue({ data: { id: "evt_123" } });
      const mockClient = withColorsMock({ insert: insertFn });
      vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
      vi.mocked(classifyOrError).mockReturnValue({
        category: "work", color: "#4285F4", calendarId: "work@cal", is_productive: true,
      });
      vi.resetModules();
      const { startServer } = await import("../../src/server/index.js");
      await startServer();
      const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
      const callToolHandler = setRequestHandler.mock.calls[1][1];

      await callToolHandler({
        params: {
          name: "create_event",
          arguments: {
            account_id: "test",
            summary: "team meeting",
            calendar_id: "custom@cal",
            start: "2024-06-01T09:00:00+05:30",
            end: "2024-06-01T10:00:00+05:30",
          },
        },
      });

      expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "custom@cal" }));
    });

    it("creates event with explicit color_id override", async () => {
      const mockAccount = { account_id: "test", email: "test@example.com", refresh_token: "rt" };
      vi.mocked(getAccount).mockReturnValue(mockAccount);
      const insertFn = vi.fn().mockResolvedValue({ data: { id: "evt_123" } });
      const mockClient = withColorsMock({ insert: insertFn });
      vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
      vi.mocked(classifyOrError).mockReturnValue({
        category: "work", color: "#4285F4", calendarId: "work@cal", is_productive: true,
      });
      vi.resetModules();
      const { startServer } = await import("../../src/server/index.js");
      await startServer();
      const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
      const callToolHandler = setRequestHandler.mock.calls[1][1];

      await callToolHandler({
        params: {
          name: "create_event",
          arguments: {
            account_id: "test",
            summary: "team meeting",
            color_id: "5",
            start: "2024-06-01T09:00:00+05:30",
            end: "2024-06-01T10:00:00+05:30",
          },
        },
      });

      expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
        requestBody: expect.objectContaining({ colorId: "5" }),
      }));
    });

    it("creates event with description and location", async () => {
      const mockAccount = { account_id: "test", email: "test@example.com", refresh_token: "rt" };
      vi.mocked(getAccount).mockReturnValue(mockAccount);
      const insertFn = vi.fn().mockResolvedValue({ data: { id: "evt_456", summary: "Deep Work" } });
      const mockClient = withColorsMock({ insert: insertFn });
      vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
      vi.mocked(classifyOrError).mockReturnValue({
        category: "work.deep_work", color: "#34A853", calendarId: "deep@cal", is_productive: true,
      });
      vi.resetModules();
      const { startServer } = await import("../../src/server/index.js");
      await startServer();
      const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
      const callToolHandler = setRequestHandler.mock.calls[1][1];

      await callToolHandler({
        params: {
          name: "create_event",
          arguments: {
            account_id: "test",
            summary: "focus session",
            description: "Planning and coding session",
            location: "Office",
            start: "2024-06-01T14:00:00+05:30",
            end: "2024-06-01T16:00:00+05:30",
          },
        },
      });

      expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
        requestBody: expect.objectContaining({
          description: "Planning and coding session",
          location: "Office",
        }),
      }));
    });

    it("rejects unclassifiable summary with isError", async () => {
      const mockAccount = { account_id: "test", email: "test@example.com", refresh_token: "rt" };
      vi.mocked(getAccount).mockReturnValue(mockAccount);
      const insertFn = vi.fn();
      const mockClient = withColorsMock({ insert: insertFn });
      vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
      vi.mocked(classifyOrError).mockImplementation(() => {
        throw new Error('Event summary "random" does not match any category in preferences_test.json');
      });
      vi.resetModules();
      const { startServer } = await import("../../src/server/index.js");
      await startServer();
      const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
      const callToolHandler = setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "create_event",
          arguments: {
            account_id: "test",
            summary: "random",
            start: "2024-06-01T09:00:00+05:30",
            end: "2024-06-01T10:00:00+05:30",
          },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("does not match any category");
      expect(insertFn).not.toHaveBeenCalled();
    });
  });

  describe("update_event", () => {
    it("updates event summary with re-classification", async () => {
      const mockAccount = { account_id: "test", email: "test@example.com", refresh_token: "rt" };
      vi.mocked(getAccount).mockReturnValue(mockAccount);
      const patchFn = vi.fn().mockResolvedValue({ data: { id: "evt_1", summary: "Updated Meeting" } });
      const mockClient = withColorsMock({ patch: patchFn });
      vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
      vi.mocked(classifyOrError).mockReturnValue({
        category: "work", color: "#4285F4", calendarId: "work@cal", is_productive: true,
      });
      vi.resetModules();
      const { startServer } = await import("../../src/server/index.js");
      await startServer();
      const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
      const callToolHandler = setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "update_event",
          arguments: {
            account_id: "test",
            calendar_id: "primary",
            event_id: "evt_1",
            summary: "daily standup",
          },
        },
      });

      expect(classifyOrError).toHaveBeenCalledWith("daily standup", "test");
      expect(patchFn).toHaveBeenCalledWith(expect.objectContaining({
        calendarId: "primary",
        eventId: "evt_1",
        requestBody: expect.objectContaining({
          summary: "daily standup",
          colorId: closestGoogleColorId("#4285F4", paletteFromMockColors()),
        }),
      }));
      expect(result.content[0].text).toContain("Updated Meeting");
    });

    it("updates event without summary — no classify call", async () => {
      const mockAccount = { account_id: "test", email: "test@example.com", refresh_token: "rt" };
      vi.mocked(getAccount).mockReturnValue(mockAccount);
      const patchFn = vi.fn().mockResolvedValue({ data: { id: "evt_1", summary: "Original Event" } });
      const mockClient = withColorsMock({ patch: patchFn });
      vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
      vi.resetModules();
      const { startServer } = await import("../../src/server/index.js");
      await startServer();
      const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
      const callToolHandler = setRequestHandler.mock.calls[1][1];

      await callToolHandler({
        params: {
          name: "update_event",
          arguments: {
            account_id: "test",
            calendar_id: "primary",
            event_id: "evt_1",
            description: "Updated description only",
          },
        },
      });

      expect(classifyOrError).not.toHaveBeenCalled();
      expect(patchFn).toHaveBeenCalledWith(expect.objectContaining({
        requestBody: expect.objectContaining({
          description: "Updated description only",
        }),
      }));
    });

    it("rejects update with unclassifiable summary", async () => {
      const mockAccount = { account_id: "test", email: "test@example.com", refresh_token: "rt" };
      vi.mocked(getAccount).mockReturnValue(mockAccount);
      const patchFn = vi.fn();
      const mockClient = withColorsMock({ patch: patchFn });
      vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
      vi.mocked(classifyOrError).mockImplementation(() => {
        throw new Error('Event summary "unknown" does not match any category in preferences_test.json');
      });
      vi.resetModules();
      const { startServer } = await import("../../src/server/index.js");
      await startServer();
      const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
      const callToolHandler = setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "update_event",
          arguments: {
            account_id: "test",
            calendar_id: "primary",
            event_id: "evt_1",
            summary: "unknown",
          },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("does not match any category");
      expect(patchFn).not.toHaveBeenCalled();
    });

    it("uses explicit color_id over classified color", async () => {
      const mockAccount = { account_id: "test", email: "test@example.com", refresh_token: "rt" };
      vi.mocked(getAccount).mockReturnValue(mockAccount);
      const patchFn = vi.fn().mockResolvedValue({ data: { id: "evt_1" } });
      const mockClient = withColorsMock({ patch: patchFn });
      vi.mocked(getCalendarClient).mockResolvedValue(mockClient as any);
      vi.mocked(classifyOrError).mockReturnValue({
        category: "personal", color: "#FBBC05", is_productive: false,
      });
      vi.resetModules();
      const { startServer } = await import("../../src/server/index.js");
      await startServer();
      const setRequestHandler = vi.mocked(Server).mock.results[0].value.setRequestHandler;
      const callToolHandler = setRequestHandler.mock.calls[1][1];

      await callToolHandler({
        params: {
          name: "update_event",
          arguments: {
            account_id: "test",
            calendar_id: "primary",
            event_id: "evt_1",
            summary: "gym session",
            color_id: "1",
          },
        },
      });

      expect(patchFn).toHaveBeenCalledWith(expect.objectContaining({
        requestBody: expect.objectContaining({ colorId: "1" }),
      }));
    });
  });
});
