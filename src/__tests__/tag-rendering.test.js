import { describe, test, expect } from "vitest";
import {
  formatReadPrompt,
  formatGetDocument,
  formatGetCollection,
  formatCreatePrompt,
  formatUpdatePrompt,
  formatUpdateDocument,
  formatCreateCollection,
  formatUpdateCollection,
} from "../_format.js";

// Phase 5 (PR-N, 2026-05-24) — npm CLI mirror of the web's
// formatters-tag-rendering.test.ts.
//
// 8 formatters render `tags` conditionally. When tags are absent or empty,
// output is byte-identical to today, protecting all 33 pre-existing
// canonical fixtures. The 9 new `*_with_tags` fixtures (now synced into
// _fixtures/canonical.json) exercise the non-empty branch end-to-end via
// the contract test.

// ---------------------------------------------------------------------------
// READ-SIDE DETAIL FORMATTERS
// ---------------------------------------------------------------------------

describe("Phase 5 — formatReadPrompt tag rendering", () => {
  test("renders **Tags:** line when tags non-empty", () => {
    const out = formatReadPrompt({
      title: "T",
      description: "d",
      engine: "gpt-4",
      currentVersion: 1,
      isPublic: false,
      content: "x",
      tags: ["a", "b"],
    });
    expect(out).toContain("**Tags:** a, b");
  });

  test("byte-identical (no Tags line) when tags absent", () => {
    const out = formatReadPrompt({
      title: "T",
      description: "d",
      engine: "gpt-4",
      currentVersion: 1,
      isPublic: false,
      content: "x",
    });
    expect(out).not.toContain("Tags:");
  });
});

describe("Phase 5 — formatGetDocument tag rendering", () => {
  test("renders **Tags:** line when tags non-empty", () => {
    const out = formatGetDocument({
      title: "Doc",
      status: "ready",
      sourceType: "text",
      content: "body",
      tags: ["one", "two"],
    });
    expect(out).toContain("**Tags:** one, two");
  });

  test("byte-identical (no Tags line) when tags absent", () => {
    const out = formatGetDocument({
      title: "Doc",
      status: "ready",
      sourceType: "text",
      content: "body",
    });
    expect(out).not.toContain("Tags:");
  });
});

describe("Phase 5 — formatGetCollection tag rendering", () => {
  test("renders **Tags:** line when tags non-empty", () => {
    const out = formatGetCollection({
      name: "Coll",
      description: "desc",
      icon: "📁",
      color: "#f97316",
      itemCount: 0,
      tags: ["x", "y"],
    });
    expect(out).toContain("**Tags:** x, y");
  });

  test("byte-identical (no Tags line) when tags absent", () => {
    const out = formatGetCollection({
      name: "Coll",
      description: "desc",
      icon: "📁",
      color: "#f97316",
      itemCount: 0,
    });
    expect(out).not.toContain("Tags:");
  });
});

// ---------------------------------------------------------------------------
// WRITE-SIDE SUCCESS FORMATTERS
// ---------------------------------------------------------------------------

describe("Phase 5 — formatCreatePrompt appends Tags suffix", () => {
  test("appends 'Tags: a, b' when args.tags non-empty", () => {
    const out = formatCreatePrompt(
      { id: "p1", title: "P", engine: "gpt-4" },
      { tags: ["a", "b"] },
    );
    expect(out).toContain("Tags: a, b");
  });

  test("byte-identical when args.tags absent (no second arg)", () => {
    const out = formatCreatePrompt({ id: "p1", title: "P", engine: "gpt-4" });
    expect(out).not.toContain("Tags:");
  });
});

describe("Phase 5 — formatUpdatePrompt appends Tags suffix", () => {
  test("appends 'Tags: a, b' when args.tags non-empty", () => {
    const out = formatUpdatePrompt(
      { title: "P", currentVersion: 2 },
      { tags: ["a", "b"] },
    );
    expect(out).toContain("Tags: a, b");
  });

  test("byte-identical when args.tags absent", () => {
    const out = formatUpdatePrompt({ title: "P", currentVersion: 2 });
    expect(out).not.toContain("Tags:");
  });
});

describe("Phase 5 — formatUpdateDocument appends Tags suffix", () => {
  test("appends 'Tags: a, b' when args.tags non-empty", () => {
    const out = formatUpdateDocument(
      { title: "D", currentVersion: 2 },
      { tags: ["a", "b"] },
    );
    expect(out).toContain("Tags: a, b");
  });

  test("byte-identical when args.tags absent", () => {
    const out = formatUpdateDocument({ title: "D", currentVersion: 2 });
    expect(out).not.toContain("Tags:");
  });
});

describe("Phase 5 — formatCreateCollection appends Tags suffix", () => {
  test("appends 'Tags: a, b' when args.tags non-empty", () => {
    const out = formatCreateCollection(
      { id: "c1" },
      { name: "C", tags: ["a", "b"] },
    );
    expect(out).toContain("Tags: a, b");
  });

  test("byte-identical when args.tags absent", () => {
    const out = formatCreateCollection({ id: "c1" }, { name: "C" });
    expect(out).not.toContain("Tags:");
  });
});

describe("Phase 5 — formatUpdateCollection appends Tags suffix", () => {
  test("appends 'Tags: a, b' when args.tags non-empty", () => {
    const out = formatUpdateCollection({ name: "C" }, { tags: ["a", "b"] });
    expect(out).toContain("Tags: a, b");
  });

  test("byte-identical when args.tags absent", () => {
    const out = formatUpdateCollection({ name: "C" });
    expect(out).not.toContain("Tags:");
  });
});
