#!/usr/bin/env bash
set -euo pipefail
# Mock reviewer — returns a machine-readable VERDICT without a real model.
# Scenario via A2_MOCK_REVIEWER_SCENARIO: comma list, one entry per review call:
#   approve -> VERDICT: APPROVE
#   revise  -> VERDICT: REVISE + a finding
# Missing/short list -> last entry (default "approve") is reused.
#
# Reviewer calls carry no round memory, so we count calls in a state file.
# The caller sets A2_MOCK_STATE_DIR (a fresh dir per run) to keep runs isolated.

state_dir="${A2_MOCK_STATE_DIR:-/tmp}"
mkdir -p "$state_dir"
counter_file="$state_dir/reviewer_calls"

n=0
[ -f "$counter_file" ] && n="$(cat "$counter_file")"
n=$((n + 1))
echo "$n" >"$counter_file"

IFS=',' read -r -a steps <<<"${A2_MOCK_REVIEWER_SCENARIO:-approve}"
idx=$((n - 1))
if [ "$idx" -lt "${#steps[@]}" ]; then
  decision="${steps[$idx]}"
else
  decision="${steps[$(( ${#steps[@]} - 1 ))]}"
fi

if [ "$decision" = "approve" ]; then
  echo "Der Diff steht für sich, Tests grün."
  echo "VERDICT: APPROVE"
else
  echo "Es gibt offene Punkte."
  echo "1. [wichtig] Fehlerbehandlung für den externen Aufruf fehlt (Review-Call $n)."
  echo "VERDICT: REVISE"
fi
