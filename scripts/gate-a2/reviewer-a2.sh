#!/bin/bash
set -euo pipefail

# Gate A2 reviewer wrapper — provider-neutral.
#
# Runs Claude Code as the `reviewer` subagent, but endpoint + key + model come
# from .env, so ANY Anthropic-API-compatible gateway can be plugged in. Scoped
# to the A2 gate on purpose: keeps arbitrary third-party endpoints OUT of the
# shared kit reviewer (scripts/opencode-reviewer.sh) that other flows depend on.
#
# SECURITY: whatever you point REVIEWER_BASE_URL at sees every diff sent to the
# reviewer AND can alter the reviewer's response (it sits between you and the
# model). Only trust it for throwaway / empty-diff tests unless you trust the
# operator.
#
# .env keys (all required):
#   REVIEWER_BASE_URL   endpoint, e.g. https://aiprimetech.io
#   REVIEWER_API_KEY    token for that endpoint
#   REVIEWER_MODEL      model id the endpoint expects, e.g. claude-opus-4-8

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found (run from the directory that holds your .env)." >&2
  exit 1
fi

# Read exactly one value for a key; reject duplicates; strip quotes/space.
read_one() {
  local key="$1" count
  count=$(grep -c "^[[:space:]]*${key}=" "$ENV_FILE" || true)
  if [ "$count" -gt 1 ]; then
    echo "Error: Duplicate ${key} entries in $ENV_FILE" >&2
    exit 1
  fi
  grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | cut -d'=' -f2- \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
          -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

REVIEWER_BASE_URL="$(read_one REVIEWER_BASE_URL)"
REVIEWER_API_KEY="$(read_one REVIEWER_API_KEY)"
REVIEWER_MODEL="$(read_one REVIEWER_MODEL)"

if [ -z "$REVIEWER_BASE_URL" ] || [ "$REVIEWER_BASE_URL" = "your_reviewer_base_url_here" ]; then
  echo "Error: REVIEWER_BASE_URL is not configured in $ENV_FILE" >&2
  exit 1
fi
if [ -z "$REVIEWER_API_KEY" ] || [ "$REVIEWER_API_KEY" = "your_reviewer_api_key_here" ]; then
  echo "Error: REVIEWER_API_KEY is not configured in $ENV_FILE" >&2
  exit 1
fi
if [ -z "$REVIEWER_MODEL" ] || [ "$REVIEWER_MODEL" = "your_reviewer_model_here" ]; then
  echo "Error: REVIEWER_MODEL is not configured in $ENV_FILE" >&2
  exit 1
fi

# reviewer subagent must exist (local first, then global)
AGENT_FOUND=false
for agent_file in .claude/agents/*.md ~/.claude/agents/*.md; do
  if [ -f "$agent_file" ] && grep -Eq '^name:[[:space:]]*reviewer[[:space:]]*$' "$agent_file" 2>/dev/null; then
    AGENT_FOUND=true
    break
  fi
done
if [ "$AGENT_FOUND" = false ]; then
  echo "Error: Subagent 'reviewer' is not defined in .claude/agents/ or ~/.claude/agents/" >&2
  echo "Fix: run '~/Documents/ai-coding-starter-kit/scripts/build-global.sh' once to deploy" >&2
  echo "     the kit's reviewer subagent (source: agents/reviewer.md) globally." >&2
  exit 1
fi

if [ "${1:-}" = "--dry-run" ]; then
  echo "ANTHROPIC_BASE_URL=$REVIEWER_BASE_URL"
  echo "ANTHROPIC_AUTH_TOKEN=${REVIEWER_API_KEY:0:8}********"
  echo "ANTHROPIC_MODEL=$REVIEWER_MODEL"
  exit 0
fi

# Run claude in a SANITIZED environment (env -i). Reason: when this runs inside
# a host-managed Claude Code session, the child `claude` inherits that session's
# OAuth (CLAUDE_CODE_SDK_HAS_*_AUTH_REFRESH, CLAUDE_CODE_OAUTH_SCOPES, an
# inherited ANTHROPIC_BASE_URL, ...) and uses it INSTEAD of our token — which a
# third-party gateway rejects with "401 Invalid API key". env -i strips all of
# that so ONLY our ANTHROPIC_* auth reaches claude.
#
# Bearer token via ANTHROPIC_AUTH_TOKEN (aiprimetech & most gateways). Official
# Anthropic would instead use ANTHROPIC_API_KEY (x-api-key).
#
# NOTE: this sanitization is what makes it work *inside* an automated Claude Code
# session. In a plain terminal `claude` won't have the host OAuth injected and may
# behave differently (e.g. use a subscription login) — re-check there if needed.
echo "Starting Gate A2 reviewer via ${REVIEWER_BASE_URL} ..." >&2
exec env -i \
  HOME="$HOME" PATH="$PATH" \
  LANG="${LANG:-en_US.UTF-8}" TERM="${TERM:-xterm}" \
  USER="${USER:-}" LOGNAME="${LOGNAME:-}" SHELL="${SHELL:-/bin/sh}" TMPDIR="${TMPDIR:-/tmp}" \
  ANTHROPIC_BASE_URL="$REVIEWER_BASE_URL" \
  ANTHROPIC_AUTH_TOKEN="$REVIEWER_API_KEY" \
  ANTHROPIC_MODEL="$REVIEWER_MODEL" \
  claude --agent reviewer "$@"
