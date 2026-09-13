import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const skillUrl = new URL("../SKILL.md", import.meta.url);

test("distributed skill follows the hosted MCP surface", async () => {
  const skill = await readFile(skillUrl, "utf8");

  assert.match(skill, /cited\s+answers over stored documents/);
  assert.match(skill, /revision-safe document writes/);
  assert.match(skill, /tools\/list/);
  assert.match(skill, /structuredContent/);
  assert.match(skill, /`reason`/);
  assert.match(skill, /document content only/);
  assert.match(skill, /`expectedRevision`/);
  assert.match(skill, /`REVISION_MISMATCH`/);
  assert.match(skill, /latest successful document acknowledgement/);
  assert.match(skill, /current document revision, not the target version/);
  assert.match(
    skill,
    /managed editing must use the REST\s+coordination workflow/,
  );

  assert.doesNotMatch(skill, /\b(?:27|28) tools\b/);
  assert.doesNotMatch(skill, /MCP accepts lease credentials/);
});
