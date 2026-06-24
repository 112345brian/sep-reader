#!/usr/bin/env bash
# Build, install, and run the Nous test APK.
# Usage: ./scripts/build-test-apk.sh [--no-install]
#
# What it does:
#   1. Flips IS_TEST_BUILD to true
#   2. Builds a debug APK
#   3. Installs on the connected Android device/emulator
#   4. Launches the app
#   5. Tails logcat until [NOUS_TEST_COMPLETE] appears
#   6. Pulls the test report JSON
#   7. Takes a screenshot via ADB
#   8. Resets IS_TEST_BUILD to false

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/src/testConfig.ts"
OUT_DIR="$ROOT/test-results"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="com.nous.app"
ACTIVITY="com.nous.app.MainActivity"
REPORT_DEVICE="/data/user/0/$PACKAGE/files/nous_test_report.json"

NO_INSTALL=false
[[ "$1" == "--no-install" ]] && NO_INSTALL=true

# ── 1. Flip test flag ────────────────────────────────────────────────────────
echo "→ Enabling test build flag..."
sed -i '' 's/IS_TEST_BUILD = false/IS_TEST_BUILD = true/' "$CONFIG"

# Ensure flag is restored even if script fails
cleanup() {
  echo "→ Restoring IS_TEST_BUILD = false..."
  sed -i '' 's/IS_TEST_BUILD = true/IS_TEST_BUILD = false/' "$CONFIG"
}
trap cleanup EXIT

# ── 2. Build APK ─────────────────────────────────────────────────────────────
echo "→ Building debug APK..."
cd "$ROOT/android"
./gradlew assembleDebug --quiet
cd "$ROOT"

# ── 3. Install ───────────────────────────────────────────────────────────────
if [ "$NO_INSTALL" = false ]; then
  echo "→ Installing on device..."
  adb install -r "$APK"

  # ── 4. Launch ───────────────────────────────────────────────────────────────
  echo "→ Launching app..."
  adb shell am start -n "$PACKAGE/$ACTIVITY"

  # ── 5. Wait for completion signal ───────────────────────────────────────────
  echo "→ Waiting for tests to complete (watching logcat)..."
  adb logcat -c  # clear log buffer
  adb logcat | grep --line-buffered '\[NOUS_TEST_COMPLETE\]' | (
    read line
    echo ""
    echo "✓ Tests complete: $line"
  ) &
  LOGCAT_PID=$!

  # Timeout after 3 minutes
  TIMEOUT=180
  ELAPSED=0
  while kill -0 $LOGCAT_PID 2>/dev/null; do
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    if [ $ELAPSED -ge $TIMEOUT ]; then
      echo "✗ Timed out after ${TIMEOUT}s waiting for test completion"
      kill $LOGCAT_PID 2>/dev/null || true
      break
    fi
  done

  # Give app a moment to write the file
  sleep 2

  # ── 6. Pull report ───────────────────────────────────────────────────────────
  mkdir -p "$OUT_DIR"
  echo "→ Pulling test report..."
  adb pull "$REPORT_DEVICE" "$OUT_DIR/nous_test_report.json" 2>/dev/null \
    && echo "  Saved to test-results/nous_test_report.json" \
    || echo "  ✗ Could not pull report — app may not have written it yet"

  # ── 7. Screenshot ────────────────────────────────────────────────────────────
  echo "→ Taking screenshot..."
  TS=$(date +%Y%m%d_%H%M%S)
  adb exec-out screencap -p > "$OUT_DIR/screenshot_${TS}.png" 2>/dev/null \
    && echo "  Saved to test-results/screenshot_${TS}.png" \
    || echo "  ✗ Screenshot failed (is a device connected?)"

  # ── Print summary from report ────────────────────────────────────────────────
  if [ -f "$OUT_DIR/nous_test_report.json" ]; then
    echo ""
    echo "── Test Summary ────────────────────────────────────"
    python3 -c "
import json, sys
with open('$OUT_DIR/nous_test_report.json') as f:
  r = json.load(f)
s = r['summary']
print(f\"  Platform : {r['platform']}\")
print(f\"  Passed   : {s['passed']} / {s['total']}\")
print(f\"  Failed   : {s['failed']}\")
print(f\"  Duration : {s['durationMs']}ms\")
if s['failed'] > 0:
  print('')
  print('  Failures:')
  for t in r['results']:
    if t['status'] == 'fail':
      print(f\"    ✗ {t['name']}: {t.get('error','')}\")
print('────────────────────────────────────────────────────')
" 2>/dev/null || cat "$OUT_DIR/nous_test_report.json"
  fi
fi

echo ""
echo "Done. Results in ./test-results/"
