#!/usr/bin/env node

/**
 * Context Repo MCP Server
 *
 * Enables any MCP-compatible client (Claude Desktop, Cursor, Factory Droid, etc.)
 * to interact with the Context Repo API for managing prompts, documents, and collections.
 *
 * @see https://modelcontextprotocol.io/
 * @see https://contextrepo.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_BASE_URL = process.env.CONTEXTREPO_API_URL || "https://api.contextrepo.com";
const API_KEY = process.env.CONTEXTREPO_API_KEY;

// TDD-H8: bound every outbound HTTP request so a hung backend cannot stall
// the stdio worker indefinitely. 30s is the same ceiling Convex uses for
// HTTP actions and is comfortably above worst-case warm-path latency.
const REQUEST_TIMEOUT_MS = 30_000;

// Auto-session state for progressive disclosure search deduplication
let currentSessionId = null;

if (!API_KEY) {
  console.error("╔════════════════════════════════════════════════════════════════╗");
  console.error("║  ERROR: CONTEXTREPO_API_KEY environment variable is required  ║");
  console.error("║                                                                ║");
  console.error("║  To fix this:                                                  ║");
  console.error("║  1. Get an API key from https://contextrepo.com/dashboard      ║");
  console.error("║  2. Add it to your MCP client config                           ║");
  console.error("╚════════════════════════════════════════════════════════════════╝");
  process.exit(1);
}

const headers = {
  Authorization: `API-Key ${API_KEY}`,
  "Content-Type": "application/json",
};

// =============================================================================
// API CLIENT
// =============================================================================

/**
 * Builds a user-facing Error from an HTTP error response.
 *
 * Behavior contract:
 *   - 401/403/404/429: emit a friendly category prefix + the server-supplied
 *     message when present (preserves actionable backend diagnostics like
 *     "Token expired", "Try again in 60s", "Document not found"). The 404
 *     category prefix intentionally contains the literal substring
 *     "Resource not found." so existing idempotent-delete handlers that
 *     match /not found/i continue to work until they migrate to
 *     `error.statusCode === 404` (TDD-M2).
 *   - 5xx (TDD-H7 — defense against smoke B-09 stack-trace leak): NEVER
 *     forward the server-supplied body to the client. Log it server-side
 *     for operators, return an opaque message.
 *   - 4xx other than the named categories: prefer the parsed server
 *     message; fall back to "API error: <status> <statusText>".
 *
 * The thrown Error carries `.statusCode` so downstream handlers can switch
 * on the HTTP status without parsing the message string (TDD-M2).
 */
function buildApiError(status, parsedBody, statusText) {
  const serverMsg =
    parsedBody?.error?.message ??
    parsedBody?.message ??
    (typeof parsedBody?.error === "string" ? parsedBody.error : null);

  let userMsg;
  if (status === 401) {
    userMsg = serverMsg
      ? `Authentication failed: ${serverMsg}`
      : "Authentication failed. Check your API key.";
  } else if (status === 403) {
    userMsg = serverMsg
      ? `Permission denied: ${serverMsg}`
      : "Permission denied. Your API key may not have the required permissions.";
  } else if (status === 404) {
    userMsg = serverMsg
      ? `Resource not found. ${serverMsg}`
      : "Resource not found. Check that the ID is correct.";
  } else if (status === 429) {
    userMsg = serverMsg
      ? `Rate limit exceeded. ${serverMsg}`
      : "Rate limit exceeded. Please wait a moment before retrying.";
  } else if (status >= 500) {
    // TDD-H7: never forward 5xx body content to the client.
    // Log server-side for operators; return opaque message.
    console.error(
      `[API ${status}] ${statusText} — server body: ${
        serverMsg ?? (parsedBody ? JSON.stringify(parsedBody) : "<no body>")
      }`,
    );
    userMsg = `Server error (status ${status}). Please retry shortly.`;
  } else {
    userMsg = serverMsg ?? `API error: ${status} ${statusText}`;
  }

  const err = new Error(userMsg);
  err.statusCode = status;
  return err;
}

async function apiRequest(method, path, body = null) {
  const url = `${API_BASE_URL}${path}`;
  const options = {
    method,
    headers,
    // TDD-H8: cap every request at REQUEST_TIMEOUT_MS so a hung backend
    // never stalls the stdio worker. AbortSignal.timeout is available in
    // Node ≥18.17 (the package's stated minimum is ≥18.0.0).
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  console.error(`[API] ${method} ${path}`);

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      let parsedBody = null;
      try {
        parsedBody = await response.json();
      } catch {
        // Response body is not JSON — leave parsedBody null.
      }

      throw buildApiError(response.status, parsedBody, response.statusText);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    // Classify timeout BEFORE the generic network-error fallthrough.
    // AbortSignal.timeout fires an AbortError (DOMException in some
    // environments); both expose `name === "AbortError"`.
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      throw new Error(
        `Request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. The API did not respond in time.`,
      );
    }
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      throw new Error(`Network error: Unable to reach API. Check your internet connection.`);
    }
    throw error;
  }
}

// =============================================================================
// RESPONSE-SHAPE HELPERS
// =============================================================================

/**
 * Returns the canonical identifier for a record returned by the Context Repo API.
 *
 * The HTTP surface returns two shapes today:
 *   - Transformed: `{ id, title, ... }` (e.g., GET/POST/PATCH /v1/prompts*)
 *   - Raw Convex doc: `{ _id, _creationTime, userId, ... }` (e.g., POST /v1/documents,
 *     POST /v1/collections — pending Group B server normalization).
 *
 * Reading `obj.id ?? obj._id` makes every handler forward-compatible with the
 * canonical shape and backwards-compatible with any legacy raw-doc response.
 */
function getId(obj) {
  return obj?.id ?? obj?._id ?? null;
}

// =============================================================================
// MCP SERVER SETUP
// =============================================================================

const server = new Server(
  {
    name: "context-repo",
    version: "1.5.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS = [
  // User Info Tool
  {
    name: "get_user_info",
    description:
      "Get information about the authenticated user, including their profile details and API key permissions. " +
      "Returns the user's name, ID, external ID, authentication method, and permission scopes. " +
      "Use this to verify your identity, check what permissions your API key has, or confirm authentication status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // Prompt Tools
  {
    name: "search_prompts",
    description:
      "List all prompts belonging to the authenticated user. Returns prompt titles, descriptions, and metadata. " +
      "Use this to browse your prompt library, find templates by keyword, or get prompt IDs needed for " +
      "read_prompt, update_prompt, and delete_prompt operations.",
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Search term to filter prompts by title or description",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 20, max: 100)",
        },
      },
    },
  },
  {
    name: "read_prompt",
    description:
      "Get the full details of a specific prompt including its content and variables. " +
      "Returns the complete prompt template text, metadata, engine target, and variable definitions. " +
      "Use after search_prompts or find_items to inspect a prompt before using or editing it.",
    inputSchema: {
      type: "object",
      properties: {
        promptId: {
          type: "string",
          description: "The unique ID of the prompt to retrieve",
        },
      },
      required: ["promptId"],
    },
  },
  {
    name: "create_prompt",
    description:
      "Create a new prompt template. Prompts can include variables using ${variableName} syntax. " +
      "Requires title, description, content, and target engine. The created prompt is immediately " +
      "available via search_prompts and find_items, and can be organized into collections with add_to_collection.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the prompt" },
        description: { type: "string", description: "Brief description of what the prompt does" },
        content: { type: "string", description: "The prompt template content. Use ${variableName} for variables." },
        engine: { type: "string", description: "Target AI model (e.g., 'gpt-4', 'claude-3', 'gemini-pro')" },
      },
      required: ["title", "description", "content", "engine"],
    },
  },
  {
    name: "update_prompt",
    description:
      "Update an existing prompt. Only provide the fields you want to change. " +
      "Each update automatically creates a new version in the prompt's history, which can be " +
      "reviewed with get_prompt_versions and rolled back with restore_prompt_version.",
    inputSchema: {
      type: "object",
      properties: {
        promptId: { type: "string", description: "The unique ID of the prompt to update" },
        title: { type: "string", description: "New title (optional)" },
        description: { type: "string", description: "New description (optional)" },
        content: { type: "string", description: "New content (optional)" },
        changeLog: { type: "string", description: "Description of what changed (for version history)" },
      },
      required: ["promptId"],
    },
  },
  {
    name: "delete_prompt",
    description:
      "Permanently delete a prompt. This action cannot be undone. " +
      "The prompt and all its version history will be removed. Use read_prompt first to confirm " +
      "you have the correct prompt before deleting.",
    inputSchema: {
      type: "object",
      properties: {
        promptId: { type: "string", description: "The unique ID of the prompt to delete" },
      },
      required: ["promptId"],
    },
  },
  {
    name: "get_prompt_versions",
    description:
      "Get the version history of a prompt. Shows all previous versions with change logs. " +
      "Returns version IDs, timestamps, author names, and content previews. Use the returned " +
      "versionId with restore_prompt_version to roll back to any previous state.",
    inputSchema: {
      type: "object",
      properties: {
        promptId: {
          type: "string",
          description: "The unique ID of the prompt",
        },
      },
      required: ["promptId"],
    },
  },
  {
    name: "restore_prompt_version",
    description:
      "Restore a prompt to a previous version. Creates a new version with the restored content. " +
      "Use get_prompt_versions first to find the versionId to restore. The restoration is " +
      "non-destructive -- it creates a new version rather than deleting intermediate versions.",
    inputSchema: {
      type: "object",
      properties: {
        promptId: {
          type: "string",
          description: "The unique ID of the prompt",
        },
        versionId: {
          type: "string",
          description: "The ID of the version to restore (from get_prompt_versions)",
        },
      },
      required: ["promptId", "versionId"],
    },
  },

  // Collection Tools
  {
    name: "list_collections",
    description:
      "List all collections belonging to the authenticated user. Returns collection names, descriptions, " +
      "item counts, and IDs. Collections are folders that organize prompts and documents into groups. " +
      "Use the returned collectionId with get_collection, update_collection, or add_to_collection.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search term to filter collections by name or description" },
        limit: { type: "number", description: "Maximum number of results to return (default: 20, max: 100)" },
      },
    },
  },
  {
    name: "get_collection",
    description:
      "Get details of a specific collection including its items. Returns the collection's name, " +
      "description, color, icon, and optionally all prompts and documents it contains. " +
      "Set includeItems to true to retrieve the full membership list.",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The unique ID of the collection" },
        includeItems: { type: "boolean", description: "Include list of items in the collection (default: false)" },
      },
      required: ["collectionId"],
    },
  },
  {
    name: "create_collection",
    description:
      "Create a new collection to organize prompts and documents. Collections act as folders " +
      "with optional color and emoji icon for visual organization. After creation, use " +
      "add_to_collection to populate it with existing prompts or documents.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the collection" },
        description: { type: "string", description: "Description of what the collection contains" },
        color: { type: "string", description: "Color code for the collection (e.g., #f97316)" },
        icon: { type: "string", description: "Emoji icon for the collection" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_collection",
    description:
      "Update a collection's metadata. Change the collection's name, description, color code, " +
      "or emoji icon. Only provide the fields you want to change. Does not affect the " +
      "prompts and documents inside the collection.",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The unique ID of the collection to update" },
        name: { type: "string", description: "New name for the collection" },
        description: { type: "string", description: "New description" },
        color: { type: "string", description: "New color code" },
        icon: { type: "string", description: "New emoji icon" },
      },
      required: ["collectionId"],
    },
  },
  {
    name: "delete_collection",
    description:
      "Delete a collection. Items in the collection are NOT deleted -- only the organizational " +
      "folder is removed. The prompts and documents that were in the collection remain " +
      "accessible via search_prompts, list_documents, and find_items.",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The unique ID of the collection to delete" },
      },
      required: ["collectionId"],
    },
  },
  {
    name: "add_to_collection",
    description:
      "Add documents or prompts to a collection. Specify the collectionId, an array of item IDs, " +
      "and whether they are 'document' or 'prompt' type. Items can belong to multiple collections. " +
      "Returns counts of items added and items already in the collection.",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The collection to add items to" },
        itemIds: { type: "array", items: { type: "string" }, description: "Array of document or prompt IDs to add" },
        itemType: { type: "string", enum: ["document", "prompt"], description: "Type of items being added" },
      },
      required: ["collectionId", "itemIds", "itemType"],
    },
  },
  {
    name: "remove_from_collection",
    description:
      "Remove documents or prompts from a collection. This only removes the association -- " +
      "the items themselves are not deleted and remain accessible. Specify the collectionId, " +
      "an array of item IDs, and whether they are 'document' or 'prompt' type.",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The collection to remove items from" },
        itemIds: { type: "array", items: { type: "string" }, description: "Array of document or prompt IDs to remove" },
        itemType: { type: "string", enum: ["document", "prompt"], description: "Type of items being removed" },
      },
      required: ["collectionId", "itemIds", "itemType"],
    },
  },

  // Document Tools
  {
    name: "list_documents",
    description:
      "List all documents belonging to the authenticated user. Returns document titles, statuses, " +
      "and IDs. Supports filtering by collection and keyword search. Use the returned document IDs " +
      "with get_document, update_document, or delete_document for further operations.",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Filter to documents in a specific collection" },
        search: { type: "string", description: "Search term to filter documents by title" },
        limit: { type: "number", description: "Maximum number of results to return (default: 20, max: 100)" },
      },
    },
  },
  {
    name: "get_document",
    description:
      "Get the full content of a specific document. Returns the complete document text, title, " +
      "tags, and metadata. Use after list_documents or find_items to read a document's content. " +
      "For granular content exploration, use deep_search and deep_read instead.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The unique ID of the document to retrieve" },
      },
      required: ["documentId"],
    },
  },
  {
    name: "create_document",
    description:
      "Create a new text document. Supports plain text or markdown content with optional tags " +
      "for categorization. The document is automatically indexed for semantic search via " +
      "find_items and deep_search. Returns the created document's ID.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the document" },
        content: { type: "string", description: "The document content (plain text or markdown)" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorizing the document" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_document",
    description:
      "Update an existing document. Only provide fields you want to change. " +
      "Each update automatically creates a new version in the document's history and triggers " +
      "re-indexing for semantic search. Use get_document_versions to review changes.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The unique ID of the document to update" },
        title: { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content (optional)" },
        changeLog: { type: "string", description: "Description of what changed (for version history)" },
      },
      required: ["documentId"],
    },
  },
  {
    name: "delete_document",
    description:
      "Permanently delete a document. This action cannot be undone. " +
      "The document, all its version history, and its search index entries will be removed. " +
      "Use get_document first to confirm you have the correct document before deleting.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The unique ID of the document to delete" },
      },
      required: ["documentId"],
    },
  },
  {
    name: "get_document_versions",
    description:
      "Get the version history of a document. Shows all previous versions with change logs. " +
      "Returns version IDs, timestamps, author names, and content previews. Use the returned " +
      "versionId with restore_document_version to roll back to any previous state.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The unique ID of the document",
        },
      },
      required: ["documentId"],
    },
  },
  {
    name: "restore_document_version",
    description:
      "Restore a document to a previous version. Creates a new version with the restored content " +
      "and triggers re-indexing for semantic search. Use get_document_versions first to find the " +
      "versionId to restore. The restoration is non-destructive -- intermediate versions are preserved.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "The unique ID of the document",
        },
        versionId: {
          type: "string",
          description: "The ID of the version to restore (from get_document_versions)",
        },
      },
      required: ["documentId", "versionId"],
    },
  },

  // Catalog Search Tool
  {
    name: "find_items",
    description:
      "Discover prompts, documents, and collections by semantic similarity or keyword match. " +
      "Returns item-level results (titles, IDs, scores, short highlights) across all content types. " +
      "Use this to locate items by topic, find what exists in your workspace, or narrow down to a " +
      "specific prompt/document/collection before operating on it. Supports filtering by type " +
      "(prompts, documents, collections) and toggling between semantic (default) and literal matching " +
      "modes. For deep exploration of document content with hierarchical navigation, use deep_search instead.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        type: {
          type: "string",
          enum: ["prompts", "documents", "collections", "all"],
          description: "Filter by type (default: all)",
        },
        semantic: {
          type: "boolean",
          description: "Use semantic search for natural language understanding (default: true). Set to false for exact literal matching.",
        },
      },
      required: ["query"],
    },
  },

  // Deep Search Tools (Progressive Disclosure)
  {
    name: "deep_search",
    description:
      "Search within document content using vector similarity and return ranked, hierarchical chunks. " +
      "Unlike find_items (which returns item-level catalog results across prompts, documents, and collections), " +
      "deep_search returns granular content fragments with structural metadata -- each result includes a chunkId, " +
      "hierarchy level (document/section/paragraph), and navigation links (parentId, siblingIds). Use the returned " +
      "chunkIds with deep_read to inspect full chunk details, or deep_expand to navigate up/down/next/previous/" +
      "surrounding in the document tree. Ideal for answering specific questions, finding passages, or progressively " +
      "exploring large documents without loading everything at once. Supports session-based deduplication, and " +
      "filtering by collection or document.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query for vector similarity matching",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (server default: 10)",
        },
        sessionId: {
          type: "string",
          description: "Optional session ID for result deduplication across searches. If omitted, an auto-session is created and reused.",
        },
        collectionId: {
          type: "string",
          description: "Filter results to a specific collection",
        },
        documentId: {
          type: "string",
          description: "Filter results to a specific document",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "deep_read",
    description:
      "Retrieve a single document chunk with full content and hierarchy metadata. Use after " +
      "deep_search (to inspect a result in detail) or deep_expand (to examine a navigated chunk). " +
      "Returns complete text plus structural position: sectionPath, chunkIndex, navigation IDs " +
      "(parentChunkId, prevSiblingId, nextSiblingId), and content metadata (wordCount, headingText). " +
      "Pass the returned chunkId to deep_expand for further navigation.",
    inputSchema: {
      type: "object",
      properties: {
        chunkId: {
          type: "string",
          description: "The chunk ID to read (from deep_search or deep_expand results)",
        },
      },
      required: ["chunkId"],
    },
  },

  {
    name: "deep_expand",
    description:
      "Navigate the document hierarchy from a chunk in 5 directions: up (parent), down (children), " +
      "next (next sibling), previous (previous sibling), surrounding (context window of nearby siblings). " +
      "Use after deep_search to explore related content without re-searching. Pass any chunkId from " +
      "deep_search or a previous deep_expand call. Use deep_read on any returned chunk for full metadata.",
    inputSchema: {
      type: "object",
      properties: {
        chunkId: {
          type: "string",
          description: "The chunk ID to expand from (from deep_search or deep_expand results)",
        },
        direction: {
          type: "string",
          enum: ["up", "down", "next", "previous", "surrounding"],
          description: "Navigation direction: up (parent), down (children), next/previous (siblings), surrounding (context window)",
        },
        count: {
          type: "number",
          description: "Number of chunks to return (optional, server default applies)",
        },
      },
      required: ["chunkId", "direction"],
    },
  },
];

// =============================================================================
// REQUEST HANDLERS
// =============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("[MCP] Listing tools");
  return { tools: TOOLS };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  console.error("[MCP] Listing prompts (protocol handler)");
  const result = await apiRequest("GET", "/v1/prompts?limit=100");
  return {
    prompts: result.data.map((p) => ({
      name: getId(p),
      description: `${p.title} — ${p.description}`,
      arguments: [],
    })),
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const promptId = request.params.name;
  console.error(`[MCP] Getting prompt (protocol handler): ${promptId}`);
  const result = await apiRequest("GET", `/v1/prompts/${promptId}`);
  const p = result.data;
  return {
    description: p.title,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: p.content,
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[MCP] Tool called: ${name}`);

  try {
    switch (name) {
      case "get_user_info": {
        const result = await apiRequest("GET", "/v1/user/me");
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      }

      case "search_prompts": {
        const params = new URLSearchParams();
        if (args.search) params.set("q", args.search);
        if (args.limit) params.set("limit", String(args.limit));

        const result = await apiRequest("GET", `/v1/prompts?${params}`);
        const summary = result.data.map((p) => ({
          id: getId(p),
          title: p.title,
          description: p.description,
          engine: p.engine,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }

      case "read_prompt": {
        const result = await apiRequest("GET", `/v1/prompts/${args.promptId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      }

      case "create_prompt": {
        const result = await apiRequest("POST", "/v1/prompts", {
          title: args.title,
          description: args.description,
          content: args.content,
          engine: args.engine,
          parameters: {},
          variables: [],
        });

        return {
          content: [
            {
              type: "text",
              text: `✓ Created prompt "${args.title}"\n\nID: ${getId(result.data)}`,
            },
          ],
        };
      }

      case "update_prompt": {
        const { promptId, ...updates } = args;
        const result = await apiRequest("PATCH", `/v1/prompts/${promptId}`, updates);

        return {
          content: [
            {
              type: "text",
              text: `✓ Updated prompt "${result.data.title}"\n\nNew version: ${result.data.currentVersion}`,
            },
          ],
        };
      }

      case "delete_prompt": {
        try {
          await apiRequest("DELETE", `/v1/prompts/${args.promptId}`);
          return {
            content: [{ type: "text", text: `✓ Deleted prompt ${args.promptId}` }],
          };
        } catch (error) {
          if (error instanceof Error && /not found/i.test(error.message)) {
            return {
              content: [{ type: "text", text: `Prompt ${args.promptId} was already deleted (no-op).` }],
            };
          }
          throw error;
        }
      }

      case "get_prompt_versions": {
        const result = await apiRequest("GET", `/v1/prompts/${args.promptId}/versions`);

        if (!result.data || result.data.length === 0) {
          return {
            content: [{ type: "text", text: "No version history found for this prompt." }],
          };
        }

        const formatted = result.data
          .map(
            (v, i) =>
              `### Version ${v.version}${i === 0 ? " (Current)" : ""}\n` +
              `- **ID:** ${getId(v)}\n` +
              `- **Changed by:** ${v.userName || "Unknown"}\n` +
              `- **Change log:** ${v.changeLog || "No description"}\n` +
              (v.content ? `- **Preview:** ${v.content.slice(0, 200)}${v.content.length > 200 ? "..." : ""}` : "")
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `## Version History (${result.data.length} versions)\n\n${formatted}`,
            },
          ],
        };
      }

      case "restore_prompt_version": {
        const result = await apiRequest("POST", `/v1/prompts/${args.promptId}/restore`, {
          versionId: args.versionId,
        });

        return {
          content: [
            {
              type: "text",
              text: `✓ Successfully restored prompt to previous version.\n\nNew version: ${result.data?.currentVersion || "unknown"}`,
            },
          ],
        };
      }

      case "list_collections": {
        const params = new URLSearchParams();
        if (args.search) params.set("search", args.search);
        if (args.limit) params.set("limit", String(args.limit));

        const result = await apiRequest("GET", `/v1/collections?${params}`);
        const summary = result.data.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          itemCount: c.itemCount,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }

      case "get_collection": {
        const result = await apiRequest("GET", `/v1/collections/${args.collectionId}`);
        let response = result.data;

        if (args.includeItems) {
          const items = await apiRequest("GET", `/v1/collections/${args.collectionId}/items?limit=50`);
          response = { ...response, items: items.data };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      }

      case "create_collection": {
        const result = await apiRequest("POST", "/v1/collections", {
          name: args.name,
          description: args.description,
          color: args.color,
          icon: args.icon,
        });

        return {
          content: [
            {
              type: "text",
              text: `✓ Created collection "${args.name}"\n\nID: ${getId(result.data)}`,
            },
          ],
        };
      }

      case "update_collection": {
        const { collectionId, ...updates } = args;
        const result = await apiRequest("PATCH", `/v1/collections/${collectionId}`, updates);

        return {
          content: [
            {
              type: "text",
              text: `✓ Updated collection "${result.data.name}"`,
            },
          ],
        };
      }

      case "delete_collection": {
        try {
          await apiRequest("DELETE", `/v1/collections/${args.collectionId}`);
          return {
            content: [{ type: "text", text: `✓ Deleted collection ${args.collectionId}` }],
          };
        } catch (error) {
          if (error instanceof Error && /not found/i.test(error.message)) {
            return {
              content: [{ type: "text", text: `Collection ${args.collectionId} was already deleted (no-op).` }],
            };
          }
          throw error;
        }
      }

      case "add_to_collection": {
        const result = await apiRequest("POST", `/v1/collections/${args.collectionId}/items`, {
          itemIds: args.itemIds,
          itemType: args.itemType,
        });

        return {
          content: [
            {
              type: "text",
              text: `✓ Added ${result.data.added} item(s) to collection\n\nAlready in collection: ${result.data.alreadyInCollection}`,
            },
          ],
        };
      }

      case "remove_from_collection": {
        const result = await apiRequest("PUT", `/v1/collections/${args.collectionId}/items`, {
          itemIds: args.itemIds,
          itemType: args.itemType,
        });

        return {
          content: [
            {
              type: "text",
              text: `✓ Removed ${result.data.removed} item(s) from collection`,
            },
          ],
        };
      }

      case "list_documents": {
        const params = new URLSearchParams();
        if (args.collectionId) params.set("collectionId", args.collectionId);
        if (args.search) params.set("search", args.search);
        if (args.limit) params.set("limit", String(args.limit));

        const result = await apiRequest("GET", `/v1/documents?${params}`);
        const summary = result.data.map((d) => ({
          id: d.id,
          title: d.title,
          status: d.status,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }

      case "get_document": {
        const result = await apiRequest("GET", `/v1/documents/${args.documentId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      }

      case "create_document": {
        const result = await apiRequest("POST", "/v1/documents", {
          title: args.title,
          content: args.content,
          tags: args.tags || [],
        });

        return {
          content: [
            {
              type: "text",
              text: `✓ Created document "${args.title}"\n\nID: ${getId(result.data)}`,
            },
          ],
        };
      }

      case "update_document": {
        const { documentId, ...updates } = args;
        const result = await apiRequest("PATCH", `/v1/documents/${documentId}`, updates);

        return {
          content: [
            {
              type: "text",
              text: `✓ Updated document "${result.data.title}"`,
            },
          ],
        };
      }

      case "delete_document": {
        try {
          await apiRequest("DELETE", `/v1/documents/${args.documentId}`);
          return {
            content: [{ type: "text", text: `✓ Deleted document ${args.documentId}` }],
          };
        } catch (error) {
          if (error instanceof Error && /not found/i.test(error.message)) {
            return {
              content: [{ type: "text", text: `Document ${args.documentId} was already deleted (no-op).` }],
            };
          }
          throw error;
        }
      }

      case "get_document_versions": {
        const result = await apiRequest("GET", `/v1/documents/${args.documentId}/versions`);

        if (!result.data || result.data.length === 0) {
          return {
            content: [{ type: "text", text: "No version history found for this document." }],
          };
        }

        const formatted = result.data
          .map(
            (v, i) =>
              `### Version ${v.version}${i === 0 ? " (Current)" : ""}\n` +
              `- **ID:** ${v._id}\n` +
              `- **Title:** ${v.title}\n` +
              `- **Changed by:** ${v.userName || "Unknown"}\n` +
              `- **Change log:** ${v.changeLog || "No description"}\n` +
              (v.content ? `- **Preview:** ${v.content.slice(0, 200)}${v.content.length > 200 ? "..." : ""}` : "")
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `## Version History (${result.data.length} versions)\n\n${formatted}`,
            },
          ],
        };
      }

      case "restore_document_version": {
        const result = await apiRequest("POST", `/v1/documents/${args.documentId}/restore`, {
          versionId: args.versionId,
        });

        return {
          content: [
            {
              type: "text",
              text: `✓ Successfully restored document to previous version.\n\nNew version: ${result.data?.currentVersion || "unknown"}`,
            },
          ],
        };
      }

      case "find_items": {
        const params = new URLSearchParams();
        params.set("q", args.query);
        if (args.type) params.set("type", args.type);
        if (args.semantic === false) params.set("semantic", "false");

        const result = await apiRequest("GET", `/v1/search?${params}`);

        // Format results similar to App MCP Server
        const sections = [];
        const isSemantic = Boolean(result.meta?.semantic);

        if (result.data.prompts?.length > 0) {
          sections.push(
            `### Prompts (${result.data.prompts.length})\n${result.data.prompts
              .map((p) => {
                if (isSemantic && typeof p.score === "number") {
                  return `- **${p.title}** (score: ${p.score.toFixed(2)}) - ${p.description?.slice(0, 100) || ""}${p.description?.length > 100 ? "..." : ""}`;
                }
                return `- **${p.title}** - ${p.description?.slice(0, 100) || ""}${p.description?.length > 100 ? "..." : ""}`;
              })
              .join("\n")}`
          );
        }

        if (result.data.documents?.length > 0) {
          sections.push(
            `### Documents (${result.data.documents.length})\n${result.data.documents
              .map((d) => {
                if (isSemantic && typeof d.score === "number") {
                  return `- **${d.title}** (score: ${d.score.toFixed(2)})`;
                }
                return `- **${d.title}**`;
              })
              .join("\n")}`
          );
        }

        if (result.data.collections?.length > 0) {
          sections.push(
            `### Collections (${result.data.collections.length})\n${result.data.collections
              .map((c) => {
                if (isSemantic && typeof c.score === "number") {
                  const matchedItems = typeof c.matchedItems === "number" ? `, ${c.matchedItems} matched items` : "";
                  return `- **${c.name}** (score: ${c.score.toFixed(2)}${matchedItems})`;
                }
                const description = c.description ? ` - ${c.description}` : "";
                return `- **${c.name}**${description}`;
              })
              .join("\n")}`
          );
        }

        const header = result.meta?.semantic
          ? `## Semantic Search Results for "${args.query}"`
          : `## Search Results for "${args.query}"`;

        return {
          content: [
            {
              type: "text",
              text: sections.length > 0 ? `${header}\n\n${sections.join("\n\n")}` : `No results found for "${args.query}".`,
            },
          ],
        };
      }

      case "deep_search": {
        // Build the search request body
        const searchBody = { query: args.query };
        if (args.limit !== undefined) searchBody.limit = args.limit;
        if (args.collectionId) searchBody.collectionId = args.collectionId;
        if (args.documentId) searchBody.documentId = args.documentId;

        // Determine sessionId to use
        let sessionIdToUse = null;

        if (args.sessionId) {
          // Explicit sessionId provided — use it directly, don't touch auto-session
          sessionIdToUse = args.sessionId;
        } else {
          // No explicit sessionId — use auto-session
          if (!currentSessionId) {
            // First call: create a session
            try {
              const sessionResult = await apiRequest("POST", "/v1/pd/session", {});
              currentSessionId = sessionResult.data.sessionId;
            } catch (err) {
              // Session creation failed — proceed without session (graceful degradation)
              console.error(`[PD] Auto-session creation failed: ${err.message}`);
            }
          }
          sessionIdToUse = currentSessionId;
        }

        if (sessionIdToUse) {
          searchBody.sessionId = sessionIdToUse;
        }

        const searchResult = await apiRequest("POST", "/v1/pd/search", searchBody);
        const results = searchResult.data.results;
        const meta = searchResult.data.meta;

        if (!results || results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No results found for "${meta?.query || args.query}".`,
              },
            ],
          };
        }

        // Format each result with hierarchy metadata
        const formattedResults = results.map((r, i) => {
          const preview = r.content?.length > 200 ? r.content.slice(0, 200) + "..." : r.content;
          const lines = [
            `### Result ${i + 1}`,
            `- **chunkId:** ${r.chunkId}`,
            `- **Score:** ${typeof r.score === "number" ? r.score.toFixed(2) : r.score}`,
            `- **Level:** ${r.level}`,
            `- **Document:** ${r.documentTitle} (${r.documentId})`,
            `- **Content:** ${preview}`,
          ];

          if (r.parentId) {
            lines.push(`- **Parent:** ${r.parentId}`);
          }

          if (r.siblingIds) {
            if (r.siblingIds.prev) lines.push(`- **Prev Sibling:** ${r.siblingIds.prev}`);
            if (r.siblingIds.next) lines.push(`- **Next Sibling:** ${r.siblingIds.next}`);
          }

          return lines.join("\n");
        });

        const header = `## Progressive Disclosure Search: "${meta.query}"\n\n**Total Results:** ${meta.totalResults}`;
        const text = `${header}\n\n${formattedResults.join("\n\n")}`;

        return {
          content: [{ type: "text", text }],
        };
      }

      case "deep_read": {
        const readResult = await apiRequest("GET", `/v1/pd/read/${args.chunkId}`);
        const chunk = readResult.data;

        const lines = [
          `## Chunk Details`,
          ``,
          `- **chunkId:** ${chunk.chunkId}`,
          `- **Level:** ${chunk.level}`,
          `- **Content:**`,
          ``,
          chunk.content,
          ``,
          `### Hierarchy`,
          `- **Document:** ${chunk.hierarchy.documentTitle} (${chunk.hierarchy.documentId})`,
          `- **Section Path:** ${chunk.hierarchy.sectionPath}`,
          ``,
          `### Position`,
          `- **Chunk Index:** ${chunk.hierarchy.position.chunkIndex}`,
        ];

        if (chunk.hierarchy.position.parentChunkId) {
          lines.push(`- **Parent Chunk:** ${chunk.hierarchy.position.parentChunkId}`);
        }
        if (chunk.hierarchy.position.prevSiblingId) {
          lines.push(`- **Prev Sibling:** ${chunk.hierarchy.position.prevSiblingId}`);
        }
        if (chunk.hierarchy.position.nextSiblingId) {
          lines.push(`- **Next Sibling:** ${chunk.hierarchy.position.nextSiblingId}`);
        }

        lines.push(``);
        lines.push(`### Metadata`);
        lines.push(`- **Word Count:** ${chunk.metadata.wordCount}`);
        lines.push(`- **Start Index:** ${chunk.metadata.startIndex}`);
        lines.push(`- **End Index:** ${chunk.metadata.endIndex}`);

        if (chunk.metadata.headingText) {
          lines.push(`- **Heading:** ${chunk.metadata.headingText}`);
        }

        lines.push(``);
        lines.push(`> Use deep_expand with this chunkId to navigate to related chunks.`);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      }

      case "deep_expand": {
        // Build the expand request body
        const expandBody = { chunkId: args.chunkId, direction: args.direction };
        if (args.count !== undefined) expandBody.count = args.count;

        const expandResult = await apiRequest("POST", "/v1/pd/expand", expandBody);
        const chunks = expandResult.data.chunks;

        if (!chunks || chunks.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No chunks found in that direction.`,
              },
            ],
          };
        }

        // Direction-specific labels
        const directionLabels = {
          up: "Parent chunk",
          down: "Child chunks",
          next: "Next sibling",
          previous: "Previous sibling",
          surrounding: "Surrounding chunks",
        };

        const label = directionLabels[args.direction] || "Chunks";

        // Format each chunk, mapping _id to chunkId
        const formattedChunks = chunks.map((chunk, i) => {
          const chunkId = chunk._id || chunk.chunkId;
          const lines = [
            `### Chunk ${i + 1}`,
            `- **chunkId:** ${chunkId}`,
            `- **Level:** ${chunk.level}`,
            `- **Chunk Index:** ${chunk.chunkIndex}`,
            `- **Document:** ${chunk.documentTitle} (${chunk.documentId})`,
          ];

          // M-049 (2026-04-26) — server-side `expandChunk` (convex/pdHttp.ts
          // expandedChunkValidator) emits the parent linkage as `parentId`.
          // Earlier versions of this formatter read `chunk.parentChunkId`,
          // which always resolved to `undefined`, so the "Parent:" line
          // silently never rendered for any direction. The wire contract is
          // verified in convex/pdHttp.ts line 27 and convex/progressiveSearch.ts
          // line 280 — both deep_search and deep_expand emit `parentId`;
          // only deep_read uses the nested `position.parentChunkId` shape.
          if (chunk.parentId) {
            lines.push(`- **Parent:** ${chunk.parentId}`);
          }

          lines.push(`- **Content:** ${chunk.content}`);

          return lines.join("\n");
        });

        const header = `## ${label}\n\n**Direction:** ${args.direction} | **Results:** ${chunks.length}`;
        const text = `${header}\n\n${formattedChunks.join("\n\n")}`;

        return {
          content: [{ type: "text", text }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`[MCP] Tool error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.error("[MCP] Listing resources");
  return {
    resources: [
      {
        uri: "contextrepo://capabilities",
        name: "API Capabilities",
        description: "View available Context Repo API capabilities",
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  console.error(`[MCP] Reading resource: ${uri}`);

  if (uri === "contextrepo://capabilities") {
    const result = await apiRequest("GET", "/v1/mcp/capabilities");
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function main() {
  console.error("╔════════════════════════════════════════════════════════════════╗");
  console.error("║              Context Repo MCP Server v1.5.0                   ║");
  console.error("╚════════════════════════════════════════════════════════════════╝");
  console.error(`[Config] API: ${API_BASE_URL}`);
  console.error(`[Config] Key: ${API_KEY.startsWith("gm_") ? "✓ Valid format (gm_***)" : "⚠ Invalid format"}`);
  console.error("");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[Server] Ready - waiting for MCP client connection");
}

main().catch((error) => {
  console.error("[Fatal] Server failed to start:", error.message);
  process.exit(1);
});
