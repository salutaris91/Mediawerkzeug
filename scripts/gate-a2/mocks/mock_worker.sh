#!/usr/bin/env bash
set -euo pipefail
# Mock worker — fulfils the envelope contract from adapters.py without Docker/agy.
# Scenario via A2_MOCK_WORKER_SCENARIO: comma list, one entry per round:
#   green    -> committed=true,  tests_passed=true
#   red      -> committed=true,  tests_passed=false  (inner loop retries)
#   nocommit -> committed=false, tests_passed=false
# Missing/short list -> last entry (default "green") is reused.
#
# Round number is derived from the round memory the orchestrator passes in
# A2_MEMORY (one entry was appended per prior round).

task="${1:-<no-task>}"

# { ... || true; } guards grep: an empty A2_MEMORY (round 1) matches nothing,
# and without this pipefail would abort the script on grep's exit 1.
prior_rounds="$( { grep -o '"round"' <<<"${A2_MEMORY:-[]}" || true; } | wc -l | tr -d ' ')"
round=$((prior_rounds + 1))

IFS=',' read -r -a steps <<<"${A2_MOCK_WORKER_SCENARIO:-green}"
idx=$((round - 1))
if [ "$idx" -lt "${#steps[@]}" ]; then
  outcome="${steps[$idx]}"
else
  outcome="${steps[$(( ${#steps[@]} - 1 ))]}"
fi

case "$outcome" in
  green)    committed=true;  tests_passed=true ;;
  red)      committed=true;  tests_passed=false ;;
  nocommit) committed=false; tests_passed=false ;;
  *)        committed=true;  tests_passed=true ;;
esac

# DIFF and TESTLOG are base64 (single line) — same contract as the real runner.
diff_text="diff --git a/demo.txt b/demo.txt
+++ mock change for task: $task (Runde $round, $outcome)"
testlog_text="mock testlog (Runde $round): tests_passed=$tests_passed"
diff_b64=$(printf '%s' "$diff_text" | base64 | tr -d '\n')
testlog_b64=$(printf '%s' "$testlog_text" | base64 | tr -d '\n')

cat <<EOF
===A2-COMMITTED===
$committed
===A2-TESTS-PASSED===
$tests_passed
===A2-DIFF-B64===
$diff_b64
===A2-TESTLOG-B64===
$testlog_b64
===A2-END===
EOF
