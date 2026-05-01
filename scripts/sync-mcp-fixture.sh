#!/usr/bin/env bash
# =============================================================================
# sync-mcp-fixture.sh — copy the canonical MCP response fixture from the web
# repo (GitMaxd-Prompts) into this npm package's local test fixture, then
# print SHA-256 of both files to confirm a clean sync.
#
# The canonical fixture lives in the web repo at
#   documentation/05-api/mcp-response-fixtures/canonical.json
# and is the single source of truth for both the web `/mcp` server and this
# npm CLI's response shape. Because the two repos have independent CI, the
# canonical is duplicated here on every sync; the contract test enforces
# byte-equality when both files are reachable so drift is caught immediately.
#
# Usage:
#   ./scripts/sync-mcp-fixture.sh
#   CONTEXT_REPO_PATH=/path/to/GitMaxd-Prompts ./scripts/sync-mcp-fixture.sh
#
# Env vars:
#   CONTEXT_REPO_PATH — absolute or relative path to the web repo root.
#                       Defaults to ../GitMaxd-Prompts so a sibling checkout
#                       works without configuration.
# =============================================================================

set -euo pipefail

# Resolve path to the web repo. Defaults to a sibling checkout.
WEB_REPO="${CONTEXT_REPO_PATH:-../GitMaxd-Prompts}"

# Locate the script's package root so the script can be invoked from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Resolve the canonical and local fixture paths.
CANONICAL_REL="documentation/05-api/mcp-response-fixtures/canonical.json"

if [[ "$WEB_REPO" = /* ]]; then
  CANONICAL_ABS="$WEB_REPO/$CANONICAL_REL"
else
  CANONICAL_ABS="$(cd "$PKG_ROOT/$WEB_REPO" 2>/dev/null && pwd)/$CANONICAL_REL" || true
fi

LOCAL_FIXTURE="$PKG_ROOT/src/__tests__/_fixtures/canonical.json"

if [[ -z "${CANONICAL_ABS:-}" || ! -f "$CANONICAL_ABS" ]]; then
  echo "ERROR: canonical fixture not found at:" >&2
  echo "       $CANONICAL_ABS" >&2
  echo "" >&2
  echo "Set CONTEXT_REPO_PATH to your local GitMaxd-Prompts checkout, e.g." >&2
  echo "  CONTEXT_REPO_PATH=/Users/you/Projects/Convex/GitMaxd-Prompts \\" >&2
  echo "    ./scripts/sync-mcp-fixture.sh" >&2
  exit 1
fi

# Ensure the local _fixtures directory exists.
mkdir -p "$(dirname "$LOCAL_FIXTURE")"

cp "$CANONICAL_ABS" "$LOCAL_FIXTURE"

# Compute SHA-256 with whichever tool is available.
sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "ERROR: neither shasum nor sha256sum found in PATH" >&2
    exit 1
  fi
}

CANONICAL_SHA="$(sha256 "$CANONICAL_ABS")"
LOCAL_SHA="$(sha256 "$LOCAL_FIXTURE")"

echo "Canonical:    $CANONICAL_ABS"
echo "Local copy:   $LOCAL_FIXTURE"
echo "Canonical SHA-256: $CANONICAL_SHA"
echo "Local SHA-256:     $LOCAL_SHA"

if [[ "$CANONICAL_SHA" == "$LOCAL_SHA" ]]; then
  echo "MATCH: local fixture is in sync with canonical."
else
  echo "MISMATCH: local fixture differs from canonical." >&2
  exit 2
fi
