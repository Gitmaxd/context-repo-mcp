#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Install dependencies (idempotent)
npm install

echo "Environment ready."
