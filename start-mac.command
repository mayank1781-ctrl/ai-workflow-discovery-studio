#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
echo "Starting AI Workflow Discovery Studio on http://localhost:5177/"
node scripts/start-local.mjs

