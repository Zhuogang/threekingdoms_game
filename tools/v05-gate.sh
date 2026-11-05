#!/usr/bin/env bash
# v0.5 tech-lead gate. Run from the repository root before committing a ticket.
#
#   tools/v05-gate.sh                 tests, build, UI lint, prettier on changed files
#   REF=<commit> tools/v05-gate.sh    also checks that legacy battle pacing (and, with CAMPAIGN=1,
#                                     a 12-month campaign run) is identical to <commit>
#
# tests/v03/performance.test.ts fails on slow machines (see docs/v0.5/README.md, "Validation
# baseline"); the script lists every failing file so anything else stands out.
set -u
cd "$(git rev-parse --show-toplevel)"
ROOT="$(pwd)"
OUT="$ROOT/.artifacts/v05-gate"
mkdir -p "$OUT"
echo "== tests"
npm test -- --maxWorkers=4 > "$OUT/test.log" 2>&1
grep -E "Test Files|Tests " "$OUT/test.log" | tail -2
grep -E "^ FAIL" "$OUT/test.log" | sed 's/ >.*//' | sort | uniq -c
echo "== typecheck and build"
npm run build > "$OUT/build.log" 2>&1 && echo "build ok" || { echo "BUILD FAILED"; grep -E "error" "$OUT/build.log" | head -20; }
echo "== lint:ui"
npm run lint:ui 2>&1 | tail -1
echo "== prettier (changed files)"
CHANGED=$(git status --porcelain | awk '{print $2}' | grep -E '\.(ts|tsx|mjs|js|json|md|css)$' || true)
if [ -n "$CHANGED" ]; then npx prettier --check $CHANGED 2>&1 | tail -2; else echo "no changed files"; fi
if [ -n "${REF:-}" ]; then
  echo "== legacy identity against $REF"
  WT=$(mktemp -d)
  git worktree add -q --detach "$WT" "$REF"
  ln -s "$ROOT/node_modules" "$WT/node_modules"
  (cd "$WT" && node tools/battle-pacing.mjs "$OUT/pacing-ref.json" 20 --canvas-only > /dev/null 2>&1)
  node tools/battle-pacing.mjs "$OUT/pacing-new.json" 20 --canvas-only > /dev/null 2>&1
  echo -n "pacing: "; python3 -I tools/v05-compare-sim.py "$OUT/pacing-ref.json" "$OUT/pacing-new.json"
  if [ "${CAMPAIGN:-0}" = 1 ]; then
    ARGS="--months 12 --scenario divided-realm-190 --factions cao,sun"
    (cd "$WT" && node tools/v03-campaign-diagnostics.mjs $ARGS --output "$OUT/diag-ref.json" > /dev/null 2>&1)
    node tools/v03-campaign-diagnostics.mjs $ARGS --output "$OUT/diag-new.json" > /dev/null 2>&1
    echo -n "campaign: "; python3 -I tools/v05-compare-sim.py "$OUT/diag-ref.json" "$OUT/diag-new.json"
  fi
  git worktree remove --force "$WT"
fi
