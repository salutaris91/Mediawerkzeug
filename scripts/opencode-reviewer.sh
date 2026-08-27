#!/bin/bash
set -e

# Sucht nach der .env Datei
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found." >&2
  exit 1
fi

# Duplikatsprüfung und Extrahierung von OPENCODE_API_KEY
KEYS_COUNT=$(grep -c '^[[:space:]]*OPENCODE_API_KEY=' "$ENV_FILE" || true)
if [ "$KEYS_COUNT" -gt 1 ]; then
  echo "Error: Duplicate OPENCODE_API_KEY entries in $ENV_FILE" >&2
  exit 1
fi
OPENCODE_API_KEY=$(grep -E '^[[:space:]]*OPENCODE_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
if [ -z "$OPENCODE_API_KEY" ] || [ "$OPENCODE_API_KEY" = "your_opencode_api_key_here" ]; then
  echo "Error: OPENCODE_API_KEY is not configured in $ENV_FILE" >&2
  exit 1
fi

# Duplikatsprüfung und Extrahierung von OPENCODE_MODEL
MODEL_COUNT=$(grep -c '^[[:space:]]*OPENCODE_MODEL=' "$ENV_FILE" || true)
if [ "$MODEL_COUNT" -gt 1 ]; then
  echo "Error: Duplicate OPENCODE_MODEL entries in $ENV_FILE" >&2
  exit 1
fi
OPENCODE_MODEL=$(grep -E '^[[:space:]]*OPENCODE_MODEL=' "$ENV_FILE" | cut -d'=' -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
if [ -z "$OPENCODE_MODEL" ] || [ "$OPENCODE_MODEL" = "your_opencode_model_here" ]; then
  echo "Error: OPENCODE_MODEL is not configured in $ENV_FILE" >&2
  exit 1
fi

# Prüft Vorhandensein des Agenten `reviewer` durch Auslesen der Frontmatter
AGENT_FOUND=false
# check local first, then global
for agent_file in .claude/agents/*.md ~/.claude/agents/*.md; do
  if [ -f "$agent_file" ] && grep -Eq '^name:[[:space:]]*reviewer[[:space:]]*$' "$agent_file" 2>/dev/null; then
    AGENT_FOUND=true
    break
  fi
done

if [ "$AGENT_FOUND" = false ]; then
  echo "Error: Subagent 'reviewer' is not defined in any .md file in .claude/agents/ or ~/.claude/agents/" >&2
  echo "Fix: run '~/Documents/ai-coding-starter-kit/scripts/build-global.sh' once to deploy" >&2
  echo "     the kit's reviewer subagent (source: agents/reviewer.md) globally." >&2
  exit 1
fi

export ANTHROPIC_BASE_URL="https://opencode.ai/zen/go"
export ANTHROPIC_API_KEY="$OPENCODE_API_KEY"
export ANTHROPIC_MODEL="$OPENCODE_MODEL"

# Dry-run Prüfung
if [ "$1" = "--dry-run" ]; then
  echo "ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"
  MASKED_KEY="${ANTHROPIC_API_KEY:0:8}********"
  echo "ANTHROPIC_API_KEY=$MASKED_KEY"
  echo "ANTHROPIC_MODEL=$ANTHROPIC_MODEL"
  exit 0
fi

echo "Starting Claude Code Reviewer via OpenCode Go..."
# Startet claude (behält alle weiteren Parameter)
exec claude --agent reviewer "$@"
