#!/usr/bin/env bash
# Copies pre-fetched InPhO seed files into the booted iOS simulator's app Documents.
# Run after `expo run:ios`: bash scripts/inject-dev-seeds.sh

set -euo pipefail

BUNDLE_ID="${1:-org.reactjs.native.example.SepReader}"
SEEDS_DIR="$(cd "$(dirname "$0")/.." && pwd)/dev-seeds"

if [[ ! -f "$SEEDS_DIR/inpho-idea.json" ]]; then
  echo "No seed files found. Run first: node scripts/fetch-dev-seeds.js" >&2
  exit 1
fi

CONTAINER=$(xcrun simctl get_app_container booted "$BUNDLE_ID" data 2>/dev/null) || {
  echo "Could not find app container for $BUNDLE_ID." >&2
  echo "Is the simulator booted and the app installed?" >&2
  exit 1
}

DEST="$CONTAINER/Documents/dev-seeds"
mkdir -p "$DEST"
cp "$SEEDS_DIR"/inpho-*.json "$DEST/"
echo "Injected seeds → $DEST"
