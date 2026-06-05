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

vi.mock("../../src/auth/client.js", () => ({
  getCalendarClient: vi.fn(),
  refreshCalendars: vi.fn(),
}));

vi.mock("../../src/classifier/index.js", () => ({
  classify: vi.fn(),
}));

import { getAccount } from "../../src/store/accounts.js";
import { classify } from "../../src/classifier/index.js";
import { getCalendarClient } from "../../src/auth/client.js";
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
      googleCalendarColorId: "1",
    };
    vi.mocked(classify).mockReturnValue(mockResult);
    expect(classify("meeting", "test")).toEqual(mockResult);
  });

  it("getCalendarClient mock resolves", async () => {
    const mockClient = { events: { list: vi.fn() } };
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
    const mockClient = { events: { list: listFn } };
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
    const mockClient = { events: { list: listFn } };
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
});
