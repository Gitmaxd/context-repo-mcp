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
import {
  formatGetUserInfo,
  formatSearchPrompts,
  formatReadPrompt,
  formatCreatePrompt,
  formatUpdatePrompt,
  formatDeletePrompt,
  formatDeletePromptIdempotent,
  formatGetPromptVersions,
  formatRestorePromptVersion,
  formatListDocuments,
  formatGetDocument,
  formatCreateDocument,
  formatUpdateDocument,
  formatDeleteDocument,
  formatDeleteDocumentIdempotent,
  formatGetDocumentVersions,
  formatRestoreDocumentVersion,
  formatListCollections,
  formatGetCollection,
  formatCreateCollection,
  formatUpdateCollection,
  formatDeleteCollection,
  formatDeleteCollectionIdempotent,
  formatAddToCollection,
  formatRemoveFromCollection,
  formatFindItems,
  formatDeepSearch,
  formatDeepSearchEmpty,
  formatDeepRead,
  formatDeepExpand,
  formatDeepExpandEmpty,
} from "./_format.js";

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
    version: "2.0.0",
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
      "Create a new prompt template. " +
      "Requires title, description, content, and target engine. The created prompt is immediately " +
      "available via search_prompts and find_items, and can be organized into collections with add_to_collection.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the prompt" },
        description: { type: "string", description: "Brief description of what the prompt does" },
        content: { type: "string", description: "The prompt template content (free-form text)." },
        engine: { type: "string", description: "Target AI model (e.g., 'gpt-4', 'claude-3', 'gemini-pro')" },
      },
      required: ["title", "description", "content", "engine"],
    },
  },
  {
    name: "update_prompt",
    description:
      "Update an existing prompt. Only provide the fields you want to change. " +
      "Updates that modify `content` create a new version in the prompt's history " +
      "(reviewable with get_prompt_versions, rollbackable with restore_prompt_version). " +
      "Title-only or description-only updates do not bump the version.",
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
      "description, color, icon, and (by default) the prompts and documents it contains. " +
      "Set includeItems to false to retrieve only the metadata without the membership list.",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "The unique ID of the collection" },
        includeItems: { type: "boolean", description: "Include list of items in the collection (default: true)" },
      },
      required: ["collectionId"],
    },
  },
  {
    name: "create_collection",
    description:
      "Create a new collection to organize prompts and documents. Collections act as folders " +
      "with optional color and emoji icon for visual organization. After creation, use " +
      "add_to_collection to populate it with existing prompts or documents. " +
      "Requires `documents.write` API key scope (collections are gated by the same scope as documents).",
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
      "prompts and documents inside the collection. " +
      "Requires `documents.write` API key scope (collections are gated by the same scope as documents).",
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
      "accessible via search_prompts, list_documents, and find_items. " +
      "Requires `documents.write` API key scope (collections are gated by the same scope as documents).",
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
      "Returns counts of items added and items already in the collection. " +
      "Requires `documents.write` API key scope (collections are gated by the same scope as documents).",
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
      "an array of item IDs, and whether they are 'document' or 'prompt' type. " +
      "Requires `documents.write` API key scope (collections are gated by the same scope as documents).",
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
      "Updates that modify `content` create a new version in the document's history " +
      "(reviewable with get_document_versions) and trigger re-indexing for semantic search. " +
      "Title-only updates do not bump the version.",
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
      "modes. Literal mode (semantic=false) searches titles, descriptions, and the first ~4 KiB of " +
      "document content; for full body-text search use deep_search.",
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
    // M-050 (2026-04-26) — synced with httpStreamableServer description at
    // app/[transport]/route.ts:1422 to surface the M-046/M-047 sparse-
    // hierarchy fallback behavior so callers know `surrounding` works on
    // heading-per-paragraph documents without manual count tuning.
    description:
      "Navigate the document hierarchy from a chunk in 5 directions: up (parent), down (children), " +
      "next (next sibling under the same parent), previous (previous sibling under the same parent), " +
      "surrounding (context window — same-parent siblings; on sparse hierarchies where the target is " +
      "the only child under its parent, surrounding automatically falls back to the last/first chunks " +
      "of the parent's prev/next sibling sections so callers still get meaningful neighbouring context). " +
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
          description: "Number of neighbours per side (default: 2). surrounding returns up to (target + count before + count after).",
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
          content: [{ type: "text", text: formatGetUserInfo(result.data) }],
          structuredContent: result,
        };
      }

      case "search_prompts": {
        const params = new URLSearchParams();
        if (args.search) params.set("q", args.search);
        if (args.limit) params.set("limit", String(args.limit));

        const result = await apiRequest("GET", `/v1/prompts?${params}`);
        return {
          content: [{ type: "text", text: formatSearchPrompts(result) }],
          structuredContent: result,
        };
      }

      case "read_prompt": {
        const result = await apiRequest("GET", `/v1/prompts/${args.promptId}`);
        return {
          content: [{ type: "text", text: formatReadPrompt(result.data) }],
          structuredContent: result,
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

        // The web `/mcp` server reads `id` directly from the canonical
        // server response; npm's getId() also handles the legacy raw-doc
        // shape so older `_id`-only responses still render a real ID.
        const promptForFormatter = {
          title: args.title,
          id: getId(result.data),
          engine: args.engine,
        };
        return {
          content: [{ type: "text", text: formatCreatePrompt(promptForFormatter) }],
          structuredContent: result,
        };
      }

      case "update_prompt": {
        const { promptId, ...updates } = args;
        const result = await apiRequest("PATCH", `/v1/prompts/${promptId}`, updates);
        return {
          content: [{ type: "text", text: formatUpdatePrompt(result.data) }],
          structuredContent: result,
        };
      }

      case "delete_prompt": {
        try {
          await apiRequest("DELETE", `/v1/prompts/${args.promptId}`);
          return {
            content: [{ type: "text", text: formatDeletePrompt(args.promptId) }],
            structuredContent: { id: args.promptId, deleted: true },
          };
        } catch (error) {
          if (error instanceof Error && /not found/i.test(error.message)) {
            return {
              content: [
                { type: "text", text: formatDeletePromptIdempotent(args.promptId) },
              ],
              structuredContent: { id: args.promptId, deleted: true },
            };
          }
          throw error;
        }
      }

      case "get_prompt_versions": {
        const result = await apiRequest("GET", `/v1/prompts/${args.promptId}/versions`);
        return {
          content: [
            { type: "text", text: formatGetPromptVersions(result.data ?? []) },
          ],
          structuredContent: result,
        };
      }

      case "restore_prompt_version": {
        const result = await apiRequest("POST", `/v1/prompts/${args.promptId}/restore`, {
          versionId: args.versionId,
        });
        return {
          content: [
            { type: "text", text: formatRestorePromptVersion(result.data) },
          ],
          structuredContent: result,
        };
      }

      case "list_collections": {
        const params = new URLSearchParams();
        if (args.search) params.set("search", args.search);
        if (args.limit) params.set("limit", String(args.limit));

        const result = await apiRequest("GET", `/v1/collections?${params}`);
        return {
          content: [{ type: "text", text: formatListCollections(result) }],
          structuredContent: result,
        };
      }

      case "get_collection": {
        const result = await apiRequest("GET", `/v1/collections/${args.collectionId}`);

        // M-050 (2026-04-26) — default `includeItems` to true so this CLI
        // matches the httpStreamableServer behavior at app/[transport]/route.ts:739
        // (`if (args.includeItems !== false)`). The two clients previously
        // diverged: the streaming server fetched items by default, this CLI
        // skipped them by default, so the same `get_collection` call against
        // the same collection returned different shapes depending on which
        // client a user was on. Explicit `includeItems: false` opts out.
        if (args.includeItems !== false) {
          const items = await apiRequest(
            "GET",
            `/v1/collections/${args.collectionId}/items?limit=50`,
          );
          return {
            content: [
              {
                type: "text",
                text: formatGetCollection(result.data, items.data),
              },
            ],
            structuredContent: { ...result, items: items.data },
          };
        }

        return {
          content: [{ type: "text", text: formatGetCollection(result.data) }],
          structuredContent: result,
        };
      }

      case "create_collection": {
        const result = await apiRequest("POST", "/v1/collections", {
          name: args.name,
          description: args.description,
          color: args.color,
          icon: args.icon,
        });

        const collectionForFormatter = { id: getId(result.data) };
        return {
          content: [
            {
              type: "text",
              text: formatCreateCollection(collectionForFormatter, {
                name: args.name,
                icon: args.icon,
                color: args.color,
              }),
            },
          ],
          structuredContent: result,
        };
      }

      case "update_collection": {
        const { collectionId, ...updates } = args;
        const result = await apiRequest("PATCH", `/v1/collections/${collectionId}`, updates);
        return {
          content: [{ type: "text", text: formatUpdateCollection(result.data) }],
          structuredContent: result,
        };
      }

      case "delete_collection": {
        try {
          await apiRequest("DELETE", `/v1/collections/${args.collectionId}`);
          return {
            content: [
              { type: "text", text: formatDeleteCollection(args.collectionId) },
            ],
            structuredContent: { id: args.collectionId, deleted: true },
          };
        } catch (error) {
          if (error instanceof Error && /not found/i.test(error.message)) {
            return {
              content: [
                {
                  type: "text",
                  text: formatDeleteCollectionIdempotent(args.collectionId),
                },
              ],
              structuredContent: { id: args.collectionId, deleted: true },
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
              text: formatAddToCollection(result.data, args.itemType),
            },
          ],
          structuredContent: result,
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
              text: formatRemoveFromCollection(result.data, args.itemType),
            },
          ],
          structuredContent: result,
        };
      }

      case "list_documents": {
        const params = new URLSearchParams();
        if (args.collectionId) params.set("collectionId", args.collectionId);
        if (args.search) params.set("search", args.search);
        if (args.limit) params.set("limit", String(args.limit));

        const result = await apiRequest("GET", `/v1/documents?${params}`);
        return {
          content: [{ type: "text", text: formatListDocuments(result) }],
          structuredContent: result,
        };
      }

      case "get_document": {
        const result = await apiRequest("GET", `/v1/documents/${args.documentId}`);
        return {
          content: [{ type: "text", text: formatGetDocument(result.data) }],
          structuredContent: result,
        };
      }

      case "create_document": {
        const result = await apiRequest("POST", "/v1/documents", {
          title: args.title,
          content: args.content,
          tags: args.tags || [],
        });

        // formatCreateDocument() reads `_id ?? id` so legacy raw-doc
        // payloads still surface the canonical ID line. Pass through the
        // raw `result.data` plus an aliased `_id` so a server returning
        // only `{ id }` also resolves correctly via getId().
        const docForFormatter = { ...result.data, _id: getId(result.data) };
        return {
          content: [
            {
              type: "text",
              text: formatCreateDocument(docForFormatter, {
                title: args.title,
                tags: args.tags,
              }),
            },
          ],
          structuredContent: result,
        };
      }

      case "update_document": {
        const { documentId, ...updates } = args;
        const result = await apiRequest("PATCH", `/v1/documents/${documentId}`, updates);
        return {
          content: [{ type: "text", text: formatUpdateDocument(result.data) }],
          structuredContent: result,
        };
      }

      case "delete_document": {
        try {
          await apiRequest("DELETE", `/v1/documents/${args.documentId}`);
          return {
            content: [
              { type: "text", text: formatDeleteDocument(args.documentId) },
            ],
            structuredContent: { id: args.documentId, deleted: true },
          };
        } catch (error) {
          if (error instanceof Error && /not found/i.test(error.message)) {
            return {
              content: [
                {
                  type: "text",
                  text: formatDeleteDocumentIdempotent(args.documentId),
                },
              ],
              structuredContent: { id: args.documentId, deleted: true },
            };
          }
          throw error;
        }
      }

      case "get_document_versions": {
        const result = await apiRequest("GET", `/v1/documents/${args.documentId}/versions`);
        return {
          content: [
            { type: "text", text: formatGetDocumentVersions(result.data ?? []) },
          ],
          structuredContent: result,
        };
      }

      case "restore_document_version": {
        const result = await apiRequest("POST", `/v1/documents/${args.documentId}/restore`, {
          versionId: args.versionId,
        });
        return {
          content: [
            { type: "text", text: formatRestoreDocumentVersion(result.data) },
          ],
          structuredContent: result,
        };
      }

      case "find_items": {
        const params = new URLSearchParams();
        params.set("q", args.query);
        if (args.type) params.set("type", args.type);
        if (args.semantic === false) params.set("semantic", "false");

        const result = await apiRequest("GET", `/v1/search?${params}`);
        const useSemantic = args.semantic !== false;

        return {
          content: [
            {
              type: "text",
              text: formatFindItems({
                query: args.query,
                useSemantic,
                data: {
                  prompts: result.data?.prompts ?? [],
                  documents: result.data?.documents ?? [],
                  collections: result.data?.collections ?? [],
                },
              }),
            },
          ],
          structuredContent: result,
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
        const results = searchResult.data?.results;

        if (!results || results.length === 0) {
          const queryEcho = searchResult.data?.meta?.query || args.query;
          return {
            content: [{ type: "text", text: formatDeepSearchEmpty(queryEcho) }],
            structuredContent: searchResult,
          };
        }

        return {
          content: [
            { type: "text", text: formatDeepSearch(searchResult.data) },
          ],
          structuredContent: searchResult,
        };
      }

      case "deep_read": {
        const readResult = await apiRequest("GET", `/v1/pd/read/${args.chunkId}`);
        return {
          content: [{ type: "text", text: formatDeepRead(readResult.data) }],
          structuredContent: readResult,
        };
      }

      case "deep_expand": {
        // Build the expand request body
        const expandBody = { chunkId: args.chunkId, direction: args.direction };
        if (args.count !== undefined) expandBody.count = args.count;

        const expandResult = await apiRequest("POST", "/v1/pd/expand", expandBody);
        const chunks = expandResult.data?.chunks;

        if (!chunks || chunks.length === 0) {
          // M-033 self-healing wording — see _format.js:formatDeepExpandEmpty.
          return {
            content: [{ type: "text", text: formatDeepExpandEmpty() }],
            structuredContent: expandResult,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: formatDeepExpand({ direction: args.direction, chunks }),
            },
          ],
          structuredContent: expandResult,
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
  console.error("║              Context Repo MCP Server v2.0.0                   ║");
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
