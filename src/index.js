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
} from "@modelcontextprotocol/sdk/types.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_BASE_URL = "https://adjoining-hare-150.convex.site";
const API_KEY = process.env.CONTEXTREPO_API_KEY;

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

async function apiRequest(method, path, body = null) {
  const url = `${API_BASE_URL}${path}`;
  const options = { method, headers };

  if (body) {
    options.body = JSON.stringify(body);
  }

  console.error(`[API] ${method} ${path}`);

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      let errorMessage = `API error: ${response.status} ${response.statusText}`;

      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        // Response body is not JSON
      }

      if (response.status === 401) {
        throw new Error("Authentication failed. Check your API key.");
      }
      if (response.status === 403) {
        throw new Error("Permission denied. Your API key may not have the required permissions.");
      }
      if (response.status === 404) {
        throw new Error("Resource not found. Check that the ID is correct.");
      }
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please wait a moment before retrying.");
      }

      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      throw new Error(`Network error: Unable to reach API. Check your internet connection.`);
    }
    throw error;
  }
}

// =============================================================================
// MCP SERVER SETUP
// =============================================================================

const server = new Server(
  {
    name: "context-repo",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS = [
  // Prompt Tools
  {
    name: "list_prompts",
    description: "List all prompts with optional search. Returns prompt titles, descriptions, and IDs.",
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
    name: "get_prompt",
    description: "Get the full details of a specific prompt including its content, parameters, and variables.",
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
    description: "Create a new prompt template. Prompts can include variables using ${variableName} syntax.",
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
    description: "Update an existing prompt. Only provide the fields you want to change.",
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
    description: "Permanently delete a prompt. This action cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        promptId: { type: "string", description: "The unique ID of the prompt to delete" },
      },
      required: ["promptId"],
    },
  },

  // Collection Tools
  {
    name: "list_collections",
    description: "List all collections you have access to. Collections organize prompts and documents.",
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
    description: "Get details of a specific collection including its items.",
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
    description: "Create a new collection to organize prompts and documents.",
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
    description: "Update a collection's metadata.",
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
    description: "Delete a collection. Items in the collection are not deleted.",
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
    description: "Add documents or prompts to a collection.",
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
    description: "Remove documents or prompts from a collection.",
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
    description: "List documents, optionally filtered by collection.",
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
    description: "Get the full content of a specific document.",
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
    description: "Create a new text document.",
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
    description: "Update an existing document. Only provide fields you want to change.",
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
    description: "Permanently delete a document. This action cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "The unique ID of the document to delete" },
      },
      required: ["documentId"],
    },
  },

  // Search Tool
  {
    name: "search_context_repo",
    description: "Search across all prompts, documents, and collections. Uses semantic search by default for natural language understanding.",
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
];

// =============================================================================
// REQUEST HANDLERS
// =============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("[MCP] Listing tools");
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[MCP] Tool called: ${name}`);

  try {
    switch (name) {
      case "list_prompts": {
        const params = new URLSearchParams();
        if (args.search) params.set("q", args.search);
        if (args.limit) params.set("limit", String(args.limit));

        const result = await apiRequest("GET", `/v1/prompts?${params}`);
        const summary = result.data.map((p) => ({
          id: p._id,
          title: p.title,
          description: p.description,
          engine: p.engine,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }

      case "get_prompt": {
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
              text: `✓ Created prompt "${args.title}"\n\nID: ${result.data._id}`,
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
        await apiRequest("DELETE", `/v1/prompts/${args.promptId}`);
        return {
          content: [{ type: "text", text: `✓ Deleted prompt ${args.promptId}` }],
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
              text: `✓ Created collection "${args.name}"\n\nID: ${result.data._id}`,
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
        await apiRequest("DELETE", `/v1/collections/${args.collectionId}`);
        return {
          content: [{ type: "text", text: `✓ Deleted collection ${args.collectionId}` }],
        };
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
              text: `✓ Created document "${args.title}"\n\nID: ${result.data._id}`,
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
        await apiRequest("DELETE", `/v1/documents/${args.documentId}`);
        return {
          content: [{ type: "text", text: `✓ Deleted document ${args.documentId}` }],
        };
      }

      case "search_context_repo": {
        const params = new URLSearchParams();
        params.set("q", args.query);
        if (args.type) params.set("type", args.type);
        if (args.semantic === false) params.set("semantic", "false");

        const result = await apiRequest("GET", `/v1/search?${params}`);

        // Format results similar to App MCP Server
        const sections = [];

        if (result.data.prompts?.length > 0) {
          sections.push(
            `### Prompts (${result.data.prompts.length})\n${result.data.prompts
              .map(
                (p) =>
                  `- **${p.title}** (score: ${p.score.toFixed(2)}) - ${p.description?.slice(0, 100) || ""}${p.description?.length > 100 ? "..." : ""}`
              )
              .join("\n")}`
          );
        }

        if (result.data.documents?.length > 0) {
          sections.push(
            `### Documents (${result.data.documents.length})\n${result.data.documents
              .map((d) => `- **${d.title}** (score: ${d.score.toFixed(2)})`)
              .join("\n")}`
          );
        }

        if (result.data.collections?.length > 0) {
          sections.push(
            `### Collections (${result.data.collections.length})\n${result.data.collections
              .map((c) => `- **${c.name}** (score: ${c.score.toFixed(2)}, ${c.matchedItems} matched items)`)
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
  console.error("║              Context Repo MCP Server v1.0.0                   ║");
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
