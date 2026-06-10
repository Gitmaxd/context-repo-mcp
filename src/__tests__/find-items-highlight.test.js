import { describe, test, expect } from "vitest";
import { formatFindItems } from "../_format.js";

// Full-body literal search alignment (web PR #249, 2026-06-09) — npm CLI
// mirror of the web's find-items-formatter.test.ts highlight/chunkId cases.
//
// The REST backend now attaches optional `highlight` (snippet around the
// literal match) and `chunkId` (the matching body chunk, usable with
// deep_read / deep_expand) to literal-mode document hits. The formatter
// renders both conditionally: when the fields are absent, output is
// byte-identical to v2.2.2, protecting all 44 canonical fixtures.

describe("formatFindItems — highlight snippet rendering", () => {
  test("renders an indented quote line for document results carrying a highlight", () => {
    const out = formatFindItems({
      query: "needle",
      useSemantic: false,
      data: {
        prompts: [],
        documents: [
          {
            documentId: "jn7xyz",
            title: "D1",
            highlight: "...the needle in context...",
          },
        ],
        collections: [],
      },
    });
    expect(out).toContain("**D1**");
    expect(out).toContain("> ...the needle in context...");
  });

  test("renders a chunkId token for chunk-derived document results", () => {
    const out = formatFindItems({
      query: "needle",
      useSemantic: false,
      data: {
        prompts: [],
        documents: [
          {
            documentId: "jn7xyz",
            title: "D1",
            highlight: "snippet",
            chunkId: "kch123",
          },
        ],
        collections: [],
      },
    });
    expect(out).toContain("(id: jn7xyz, chunkId: kch123)");
  });

  test("flattens newlines in the highlight so the quote stays one markdown line", () => {
    const out = formatFindItems({
      query: "needle",
      useSemantic: false,
      data: {
        prompts: [],
        documents: [
          {
            documentId: "jn7xyz",
            title: "D1",
            highlight: "| Step | Task |\n|---|---|\n| B1 | needle row |",
          },
        ],
        collections: [],
      },
    });
    expect(out).toContain("> | Step | Task | |---|---| | B1 | needle row |");
    // Exactly one quoted line — no snippet content escapes the quote.
    const quoteLines = out
      .split("\n")
      .filter((line) => line.trimStart().startsWith(">"));
    expect(quoteLines).toHaveLength(1);
  });

  test("semantic-mode document rows also render the snippet when present", () => {
    const out = formatFindItems({
      query: "needle",
      useSemantic: true,
      data: {
        prompts: [],
        documents: [
          {
            documentId: "jn7xyz",
            title: "D1",
            score: 0.91,
            highlight: "...the needle in context...",
          },
        ],
        collections: [],
      },
    });
    expect(out).toContain("(id: jn7xyz, score: 0.91)");
    expect(out).toContain("> ...the needle in context...");
  });

  test("byte-identical to the pre-2.2.3 shape when highlight/chunkId are absent", () => {
    const literal = formatFindItems({
      query: "q",
      useSemantic: false,
      data: {
        prompts: [],
        documents: [{ documentId: "doc_bbb", title: "Sample Document", status: "ready" }],
        collections: [],
      },
    });
    expect(literal).toBe(
      '## Search Results for "q"\n\n### Documents (1)\n- **Sample Document** (id: doc_bbb) (ready)',
    );

    const semantic = formatFindItems({
      query: "q",
      useSemantic: true,
      data: {
        prompts: [],
        documents: [{ documentId: "doc_bbb", title: "Sample Document", score: 0.75 }],
        collections: [],
      },
    });
    expect(semantic).toBe(
      '## Semantic Search Results for "q"\n\n### Documents (1)\n- **Sample Document** (id: doc_bbb, score: 0.75)',
    );
  });
});
