/**
 * Pure response formatters for the Context Repo npm CLI MCP server.
 *
 * Each function below takes the REST `/v1/*` response payload (or a small
 * argument tuple for action / synthesized branches) and produces the
 * canonical Markdown text emitted in `content[0].text`. Every returned
 * string is locked byte-for-byte by the cross-surface canonical fixture
 * at `src/__tests__/_fixtures/canonical.json`, which is itself a copy of
 * the canonical at GitMaxd-Prompts/documentation/05-api/mcp-response-fixtures/canonical.json.
 *
 * Formatters are intentionally pure: no I/O, no global state, no logger.
 * That keeps them easy to dispatch from the contract test and to re-use
 * from the tool callbacks in `index.js` as a thin REST → formatter
 * dispatcher.
 *
 * This module mirrors the web counterpart at
 * `app/[transport]/_response-formatters.ts` in the GitMaxd-Prompts repo
 * (Phase 2 of the MCP Server Alignment mission, 2026-04-30). When the
 * canonical fixture changes, both surfaces must update in lockstep --
 * the contract test compares output byte-for-byte against the fixture.
 */

// ---------------------------------------------------------------------------
// USER
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   id?: unknown,
 *   name?: unknown,
 *   email?: unknown,
 *   externalId?: unknown,
 *   authMethod?: unknown,
 *   permissions?: unknown,
 * }} user
 * @returns {string}
 */
export function formatGetUserInfo(user) {
  const u = user ?? {};
  const name = u.name ?? "Unknown";
  const id = u.id ?? "";
  const email = u.email ?? "";
  const externalId = u.externalId ?? "";
  const authMethod = u.authMethod ?? "";
  const permissions = Array.isArray(u.permissions)
    ? u.permissions.join(", ")
    : "";

  return (
    `# ${name}\n\n` +
    `- **ID:** ${id}\n` +
    `- **Email:** ${email}\n` +
    `- **External ID:** ${externalId}\n` +
    `- **Auth Method:** ${authMethod}\n` +
    `- **Permissions:** ${permissions}`
  );
}

// ---------------------------------------------------------------------------
// PROMPTS
// ---------------------------------------------------------------------------

/**
 * @param {{ data?: unknown[], pagination?: { cursor?: string, hasMore?: boolean } | null }} response
 * @returns {string}
 */
export function formatSearchPrompts(response) {
  const prompts = response?.data ?? [];
  const baseText =
    prompts.length > 0
      ? `Found ${prompts.length} prompts:\n\n${prompts
          .map(
            (p) =>
              `- **${p.title}** (v${p.currentVersion})\n  ${p.description}\n  Engine: ${p.engine} | ID: ${p.id}`,
          )
          .join("\n\n")}`
      : "No prompts found.";
  const pagination = response?.pagination;
  const hint = pagination && pagination.hasMore
    ? `\n\nMore results available. To fetch the next page, re-run search_prompts with cursor="${pagination.cursor}"`
    : "";
  return baseText + hint;
}

/**
 * @param {{
 *   id?: unknown,
 *   title?: unknown,
 *   description?: unknown,
 *   engine?: unknown,
 *   isPublic?: unknown,
 *   currentVersion?: unknown,
 *   content?: unknown,
 *   variables?: Array<{ name: string, description?: string }>,
 * }} prompt
 * @returns {string}
 */
export function formatReadPrompt(prompt) {
  const variables = prompt?.variables;
  const variablesBlock =
    variables && variables.length > 0
      ? `## Variables\n\n${variables
          .map((v) => `- \`\${${v.name}}\` - ${v.description || "No description"}`)
          .join("\n")}`
      : "";

  return (
    `# ${prompt.title}\n\n` +
    `**Description:** ${prompt.description}\n` +
    `**Engine:** ${prompt.engine}\n` +
    `**Version:** ${prompt.currentVersion}\n` +
    `**Public:** ${prompt.isPublic ? "Yes" : "No"}\n\n` +
    `## Content\n\n` +
    "```\n" +
    `${prompt.content}\n` +
    "```\n\n" +
    variablesBlock
  );
}

/**
 * @param {{ title?: unknown, id?: unknown, engine?: unknown }} prompt
 * @returns {string}
 */
export function formatCreatePrompt(prompt) {
  return `Successfully created prompt "${prompt.title}"\n\nID: ${prompt.id}\nEngine: ${prompt.engine}`;
}

/**
 * @param {{ title?: unknown, currentVersion?: unknown }} prompt
 * @returns {string}
 */
export function formatUpdatePrompt(prompt) {
  return `Successfully updated prompt "${prompt.title}"\n\nVersion: ${prompt.currentVersion}`;
}

/**
 * @param {string} promptId
 * @returns {string}
 */
export function formatDeletePrompt(promptId) {
  return `Successfully deleted prompt ${promptId}`;
}

/**
 * @param {string} promptId
 * @returns {string}
 */
export function formatDeletePromptIdempotent(promptId) {
  return `Prompt ${promptId} was already deleted (no-op).`;
}

/**
 * @param {Array<{
 *   id?: unknown,
 *   version?: unknown,
 *   userName?: unknown,
 *   changeLog?: unknown,
 *   content?: unknown,
 * }>} versions
 * @returns {string}
 */
export function formatGetPromptVersions(versions) {
  if (!versions || versions.length === 0) {
    return "No version history found for this prompt.";
  }
  return (
    `## Version History (${versions.length} versions)\n\n` +
    versions
      .map(
        (v, i) =>
          `### Version ${v.version}${i === 0 ? " (Latest Snapshot)" : ""}\n` +
          `- **ID:** ${v.id}\n` +
          `- **Changed by:** ${v.userName || "Unknown"}\n` +
          `- **Change log:** ${v.changeLog || "No description"}\n` +
          `- **Preview:** ${v.content}`,
      )
      .join("\n\n")
  );
}

/**
 * @param {{ currentVersion?: unknown }} prompt
 * @returns {string}
 */
export function formatRestorePromptVersion(prompt) {
  return `Successfully restored prompt to previous version.\n\nNew version number: ${prompt?.currentVersion}`;
}

// ---------------------------------------------------------------------------
// DOCUMENTS
// ---------------------------------------------------------------------------

/**
 * @param {{ data?: unknown[], pagination?: { cursor?: string, hasMore?: boolean } | null }} response
 * @returns {string}
 */
export function formatListDocuments(response) {
  const docs = response?.data ?? [];
  const baseText =
    docs.length > 0
      ? `Found ${docs.length} documents:\n\n${docs
          .map(
            (d) =>
              `- **${d.title}**\n  Status: ${d.status} | Type: ${d.sourceType || "text"} | ID: ${d.id}`,
          )
          .join("\n\n")}`
      : "No documents found.";
  const pagination = response?.pagination;
  const hint = pagination && pagination.hasMore
    ? `\n\nMore results available. To fetch the next page, re-run list_documents with cursor="${pagination.cursor}"`
    : "";
  return baseText + hint;
}

/**
 * @param {{
 *   id?: unknown,
 *   title?: unknown,
 *   status?: unknown,
 *   sourceType?: unknown,
 *   sourceUrl?: unknown,
 *   createdAt?: unknown,
 *   content?: unknown,
 * }} document
 * @returns {string}
 */
export function formatGetDocument(document) {
  const createdAt = document?.createdAt
    ? new Date(document.createdAt).toLocaleDateString()
    : "Unknown";
  const sourceUrlSuffix = document?.sourceUrl ? ` (${document.sourceUrl})` : "";

  return (
    `# ${document.title}\n\n` +
    `**Status:** ${document.status}\n` +
    `**Source:** ${document.sourceType || "text"}${sourceUrlSuffix}\n` +
    `**Created:** ${createdAt}\n\n` +
    `## Content\n\n` +
    `${document.content || "*No content available*"}`
  );
}

/**
 * @param {{ id?: unknown, _id?: unknown, title?: unknown }} document
 * @param {{ title: string, tags?: string[] }} args
 * @returns {string}
 */
export function formatCreateDocument(document, args) {
  const docId = document?._id ?? document?.id;
  const tagsSuffix =
    args.tags && args.tags.length > 0 ? `\nTags: ${args.tags.join(", ")}` : "";
  return docId
    ? `Successfully created document "${args.title}"\n\nID: ${docId}${tagsSuffix}`
    : `Successfully created document "${args.title}" (no ID returned)`;
}

/**
 * @param {{ title?: unknown, currentVersion?: unknown }} document
 * @returns {string}
 */
export function formatUpdateDocument(document) {
  return `Successfully updated document "${document.title}"\n\nVersion: ${document.currentVersion}`;
}

/**
 * @param {string} documentId
 * @returns {string}
 */
export function formatDeleteDocument(documentId) {
  return `Successfully deleted document ${documentId}`;
}

/**
 * @param {string} documentId
 * @returns {string}
 */
export function formatDeleteDocumentIdempotent(documentId) {
  return `Document ${documentId} was already deleted (no-op).`;
}

/**
 * @param {Array<{
 *   id?: unknown,
 *   version?: unknown,
 *   title?: unknown,
 *   userName?: unknown,
 *   changeLog?: unknown,
 *   content?: unknown,
 * }>} versions
 * @returns {string}
 */
export function formatGetDocumentVersions(versions) {
  if (!versions || versions.length === 0) {
    return "No version history found for this document.";
  }
  return (
    `## Version History (${versions.length} versions)\n\n` +
    versions
      .map(
        (v, i) =>
          `### Version ${v.version}${i === 0 ? " (Latest Snapshot)" : ""}\n` +
          `- **ID:** ${v.id}\n` +
          `- **Title:** ${v.title}\n` +
          `- **Changed by:** ${v.userName || "Unknown"}\n` +
          `- **Change log:** ${v.changeLog || "No description"}\n` +
          (v.content ? `- **Preview:** ${v.content}` : ""),
      )
      .join("\n\n")
  );
}

/**
 * @param {{ currentVersion?: unknown }} document
 * @returns {string}
 */
export function formatRestoreDocumentVersion(document) {
  return `Successfully restored document to previous version.\n\nNew version number: ${document?.currentVersion}`;
}

// ---------------------------------------------------------------------------
// COLLECTIONS
// ---------------------------------------------------------------------------

/**
 * @param {{ data?: unknown[], pagination?: { cursor?: string, hasMore?: boolean } | null }} response
 * @returns {string}
 */
export function formatListCollections(response) {
  const collections = response?.data ?? [];
  const baseText =
    collections.length > 0
      ? `Found ${collections.length} collections:\n\n${collections
          .map(
            (c) =>
              `- ${c.icon || "📁"} **${c.name}**${c.description ? ` - ${c.description}` : ""}\n  Items: ${c.itemCount || 0} | ID: ${c.id}`,
          )
          .join("\n\n")}`
      : "No collections found.";
  const pagination = response?.pagination;
  const hint = pagination && pagination.hasMore
    ? `\n\nMore results available. To fetch the next page, re-run list_collections with cursor="${pagination.cursor}"`
    : "";
  return baseText + hint;
}

/**
 * @param {{
 *   id?: unknown,
 *   name?: unknown,
 *   description?: unknown,
 *   color?: unknown,
 *   icon?: unknown,
 *   itemCount?: unknown,
 * }} collection
 * @param {Array<{ title?: unknown, itemType?: unknown, itemId?: unknown }>} [items]
 * @returns {string}
 */
export function formatGetCollection(collection, items) {
  let itemsText = "";
  if (items && items.length > 0) {
    itemsText = `\n\n## Items (${items.length})\n\n${items
      .map((item) => `- **${item.title}** (${item.itemType})\n  ID: ${item.itemId}`)
      .join("\n")}`;
  }

  return (
    `# ${collection.icon || "📁"} ${collection.name}\n\n` +
    `**Description:** ${collection.description || "No description"}\n` +
    `**Items:** ${collection.itemCount || 0}\n` +
    `**Color:** ${collection.color || "Default"}` +
    itemsText
  );
}

/**
 * @param {{ id?: unknown, _id?: unknown }} collection
 * @param {{ name: string, icon?: string, color?: string }} args
 * @returns {string}
 */
export function formatCreateCollection(collection, args) {
  const id = collection?._id ?? collection?.id;
  const iconLine = args.icon ? `\nIcon: ${args.icon}` : "";
  const colorLine = args.color ? `\nColor: ${args.color}` : "";
  return `Successfully created collection "${args.name}"\n\nID: ${id}${iconLine}${colorLine}`;
}

/**
 * @param {{ name?: unknown }} collection
 * @returns {string}
 */
export function formatUpdateCollection(collection) {
  return `Successfully updated collection "${collection.name}"`;
}

/**
 * @param {string} collectionId
 * @returns {string}
 */
export function formatDeleteCollection(collectionId) {
  return `Successfully deleted collection ${collectionId}\n\nNote: Documents and prompts that were in this collection are NOT deleted.`;
}

/**
 * @param {string} collectionId
 * @returns {string}
 */
export function formatDeleteCollectionIdempotent(collectionId) {
  return `Collection ${collectionId} was already deleted (no-op).`;
}

/**
 * @param {{ added?: unknown, alreadyInCollection?: unknown }} result
 * @param {string} itemType
 * @returns {string}
 */
export function formatAddToCollection(result, itemType) {
  return `Successfully added ${result.added} ${itemType}(s) to collection\n\nAlready in collection: ${result.alreadyInCollection}`;
}

/**
 * @param {{ removed?: unknown }} result
 * @param {string} itemType
 * @returns {string}
 */
export function formatRemoveFromCollection(result, itemType) {
  return `Successfully removed ${result.removed} ${itemType}(s) from collection`;
}

// ---------------------------------------------------------------------------
// CATALOG SEARCH (find_items)
// ---------------------------------------------------------------------------

/**
 * Mirrors the web's `find-items-formatter.ts` byte-for-byte. The wire shape
 * is unchanged from earlier npm versions; this implementation just re-routes
 * through the canonical formatter so cross-surface drift is caught at test
 * time.
 *
 * @param {{
 *   query: string,
 *   useSemantic: boolean,
 *   data: {
 *     prompts: Array<Record<string, unknown>>,
 *     documents: Array<Record<string, unknown>>,
 *     collections: Array<Record<string, unknown>>,
 *   },
 * }} input
 * @returns {string}
 */
export function formatFindItems(input) {
  const { query, useSemantic, data } = input;
  const sections = [];

  const prompts = data?.prompts ?? [];
  const documents = data?.documents ?? [];
  const collections = data?.collections ?? [];

  if (prompts.length > 0) {
    sections.push(
      `### Prompts (${prompts.length})\n${prompts
        .map((p) => {
          const desc = p.description || "";
          const truncated =
            desc.length > 100 ? `${desc.slice(0, 100)}...` : desc;
          const id = String(p.promptId ?? "");
          if (useSemantic) {
            return `- **${p.title}** (id: ${id}, score: ${Number(p.score).toFixed(2)}) - ${truncated}`;
          }
          return `- **${p.title}** (id: ${id}) - ${truncated}`;
        })
        .join("\n")}`,
    );
  }

  if (documents.length > 0) {
    sections.push(
      `### Documents (${documents.length})\n${documents
        .map((d) => {
          const id = String(d.documentId ?? "");
          if (useSemantic) {
            return `- **${d.title}** (id: ${id}, score: ${Number(d.score).toFixed(2)})`;
          }
          return `- **${d.title}** (id: ${id})${d.status ? ` (${d.status})` : ""}`;
        })
        .join("\n")}`,
    );
  }

  if (collections.length > 0) {
    sections.push(
      `### Collections (${collections.length})\n${collections
        .map((c) => {
          const id = String(c.collectionId ?? "");
          if (useSemantic) {
            return `- **${c.name}** (id: ${id}, score: ${Number(c.score).toFixed(2)}, ${c.matchedItems} matched items)`;
          }
          return `- **${c.name}** (id: ${id})${c.description ? ` - ${c.description}` : ""}`;
        })
        .join("\n")}`,
    );
  }

  return sections.length > 0
    ? `## ${useSemantic ? "Semantic " : ""}Search Results for "${query}"\n\n${sections.join("\n\n")}`
    : `No results found for "${query}".`;
}

// ---------------------------------------------------------------------------
// PROGRESSIVE DISCLOSURE (deep_search / deep_read / deep_expand)
// ---------------------------------------------------------------------------

/**
 * @param {string} query
 * @returns {string}
 */
export function formatDeepSearchEmpty(query) {
  return `No results found for "${query}".`;
}

/**
 * @param {{
 *   results?: Array<{
 *     chunkId?: unknown,
 *     score?: unknown,
 *     level?: unknown,
 *     documentTitle?: unknown,
 *     documentId?: unknown,
 *     content?: unknown,
 *     parentId?: unknown,
 *     siblingIds?: { prev?: unknown, next?: unknown },
 *   }>,
 *   meta?: { query?: unknown, totalResults?: unknown },
 * }} payload
 * @returns {string}
 */
export function formatDeepSearch(payload) {
  const results = payload?.results ?? [];
  const meta = payload?.meta ?? {};
  const formatted = results.map((r, i) => {
    const lines = [
      `### Result ${i + 1}`,
      `- **chunkId:** ${r.chunkId}`,
      `- **Score:** ${typeof r.score === "number" ? r.score.toFixed(2) : r.score}`,
      `- **Level:** ${r.level}`,
      `- **Document:** ${r.documentTitle} (${r.documentId})`,
      `- **Content:** ${r.content}`,
    ];
    if (r.parentId) lines.push(`- **Parent:** ${r.parentId}`);
    const siblingIds = r.siblingIds;
    if (siblingIds && siblingIds.prev) lines.push(`- **Prev Sibling:** ${siblingIds.prev}`);
    if (siblingIds && siblingIds.next) lines.push(`- **Next Sibling:** ${siblingIds.next}`);
    return lines.join("\n");
  });

  return `## Progressive Disclosure Search: "${meta.query}"\n\n**Total Results:** ${meta.totalResults}\n\n${formatted.join("\n\n")}`;
}

/**
 * @param {{
 *   chunkId?: unknown,
 *   level?: unknown,
 *   content?: unknown,
 *   hierarchy?: {
 *     documentTitle?: unknown,
 *     documentId?: unknown,
 *     sectionPath?: unknown,
 *     position?: {
 *       chunkIndex?: unknown,
 *       parentChunkId?: unknown,
 *       prevSiblingId?: unknown,
 *       nextSiblingId?: unknown,
 *     },
 *   },
 *   metadata?: {
 *     wordCount?: unknown,
 *     startIndex?: unknown,
 *     endIndex?: unknown,
 *     headingText?: unknown,
 *   },
 * }} chunk
 * @returns {string}
 */
export function formatDeepRead(chunk) {
  const hierarchy = chunk?.hierarchy ?? {};
  const position = hierarchy.position ?? {};
  const metadata = chunk?.metadata ?? {};

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
    `- **Document:** ${hierarchy.documentTitle} (${hierarchy.documentId})`,
    `- **Section Path:** ${hierarchy.sectionPath}`,
    ``,
    `### Position`,
    `- **Chunk Index:** ${position.chunkIndex}`,
  ];

  if (position.parentChunkId) {
    lines.push(`- **Parent Chunk:** ${position.parentChunkId}`);
  }
  if (position.prevSiblingId) {
    lines.push(`- **Prev Sibling:** ${position.prevSiblingId}`);
  }
  if (position.nextSiblingId) {
    lines.push(`- **Next Sibling:** ${position.nextSiblingId}`);
  }

  lines.push(``, `### Metadata`);
  lines.push(`- **Word Count:** ${metadata.wordCount}`);
  lines.push(`- **Start Index:** ${metadata.startIndex}`);
  lines.push(`- **End Index:** ${metadata.endIndex}`);
  if (metadata.headingText) {
    lines.push(`- **Heading:** ${metadata.headingText}`);
  }
  lines.push(``, `> Use deep_expand with this chunkId to navigate to related chunks.`);

  return lines.join("\n");
}

const DEEP_EXPAND_LABELS = {
  up: "Parent chunk",
  down: "Child chunks",
  next: "Next sibling",
  previous: "Previous sibling",
  surrounding: "Surrounding chunks",
};

/**
 * @param {{
 *   direction: string,
 *   chunks: Array<{
 *     _id?: unknown,
 *     chunkId?: unknown,
 *     level?: unknown,
 *     chunkIndex?: unknown,
 *     documentTitle?: unknown,
 *     documentId?: unknown,
 *     parentId?: unknown,
 *     content?: unknown,
 *   }>,
 * }} input
 * @returns {string}
 */
export function formatDeepExpand(input) {
  const { direction, chunks } = input;
  const label = DEEP_EXPAND_LABELS[direction] || "Chunks";
  const formatted = chunks.map((chunk, i) => {
    const chunkId = chunk._id || chunk.chunkId;
    const lines = [
      `### Chunk ${i + 1}`,
      `- **chunkId:** ${chunkId}`,
      `- **Level:** ${chunk.level}`,
      `- **Chunk Index:** ${chunk.chunkIndex}`,
      `- **Document:** ${chunk.documentTitle} (${chunk.documentId})`,
    ];
    if (chunk.parentId) lines.push(`- **Parent:** ${chunk.parentId}`);
    lines.push(`- **Content:** ${chunk.content}`);
    return lines.join("\n");
  });

  return `## ${label}\n\n**Direction:** ${direction} | **Results:** ${chunks.length}\n\n${formatted.join("\n\n")}`;
}

/**
 * M-033 self-healing empty-results message for `deep_expand`. The chunk
 * tree for a freshly-created document can be rewritten by the chunker
 * mid-pass, so a `chunkId` returned by an earlier `deep_search` may go
 * stale within seconds. The wording matches the canonical fixture
 * verbatim — including the U+2014 em-dash — so agents that key off the
 * message keep their behavior across surfaces.
 *
 * @returns {string}
 */
export function formatDeepExpandEmpty() {
  return (
    "No chunks found in that direction. If this chunkId was " +
    "returned from a very recently created document, re-run " +
    "deep_search to obtain fresh chunkIds — the chunk tree " +
    "may have been rebuilt while the document was being indexed."
  );
}
