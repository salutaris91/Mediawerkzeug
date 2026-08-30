#!/usr/bin/env bash
set -euo pipefail

# Gate A2 worker runner — A2 copy of scripts/spikes/run_agy_worker.sh.
#
# Differences from the original (see docs/plan-gate-a2-bridge.md, ADR A2-5):
#   * git init INSIDE the isolated workspace -> real diffs for the reviewer.
#   * emits the adapters.py envelope on STDOUT; ALL diagnostics go to STDERR,
#     so the orchestrator can parse stdout cleanly.
#   * the runner commits the post-agy state itself (--allow-empty), so a run
#     that legitimately writes nothing still produces a reviewable commit.
#
# TWO MODES (via A2_ALLOW_WRITE), with matching tests_passed semantics:
#   default (A2_ALLOW_WRITE unset/0) — A1 NULL-WRITE TEST:
#     agy runs WITHOUT --dangerously-skip-permissions and without a TTY, so it
#     cannot ask for permission and must not write. Success = clean run AND
#     empty workspace (permission boundary held).  tests_passed = (empty && exit 0)
#   write mode (A2_ALLOW_WRITE=1) — REAL CODING TASK:
#     agy runs WITH --dangerously-skip-permissions (safe: throwaway container,
#     no host mount, no git remote) and is expected to write code. Success =
#     clean run AND a non-empty workspace.  tests_passed = (non-empty && exit 0)
#   A real per-task test/lint command (--test-cmd) is a deliberate follow-up gate;
#   for now "wrote something" is the write-mode success proxy.
#
# Env hooks:
#   A2_MEMORY      JSON round memory from the orchestrator (optional, appended to prompt)
#   A2_SKIP_AGY    if 1, skip the agy call — Docker/git/envelope plumbing self-test.
#   A2_ALLOW_WRITE if 1, run agy with --dangerously-skip-permissions (write mode).
#
# This is NOT branch-locked (unlike the original): it lives under scripts/gate-a2/
# and is owned by this orchestrator, not the agy-worker worktree.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# IMAGE is the audited Gate A1a base image directly (ghcr.io/openhands/agent-server
# derivative) — agy runs against it with no keyring/dbus layer on top. Verified
# 2026-08-21: agy uses file-based token storage in a container (~/.gemini), not
# gnome-keyring, and ca-certificates is already present in this base image, so
# the openhands-agy-keyring layer (Dockerfile.keyring: dbus/gnome-keyring/libsecret,
# built for A1a.2 when the token was expected to need a secret-service keyring)
# was dead weight for the worker path. This script already called agy directly
# (no agy-wrapper.sh) before this change; only the image itself was still the
# heavier keyring build. Simplification proven first in the unmerged branch
# feature/openhands-agy-worker (commit cf977eb, scripts/spikes/run_agy_worker.sh)
# and adopted here once the cwa-alexandria E2E test (which this was deliberately
# deferred for) was confirmed working. openhands-agy-keyring:1.1.4 stays in use
# by the separate login harness (run_agy_login.sh) — not touched here.
# Bumped 1.1.4 -> 1.1.20 (Alex, 2026-08-25): the old agy binary predates
# Gemini 3.7 Flash and rejected --model gemini-3.7-flash-high with "model
# ... is not recognized" — verified directly against the running container,
# not assumed. New binary sourced from the official, public GitHub release
# github.com/google-antigravity/antigravity-cli/releases/tag/1.1.20
# (agy_cli_linux_arm64.tar.gz, downloaded with Alex's explicit go-ahead,
# SHA256 pinned in Dockerfile.worker) — same provenance process as the
# original 1.1.4 build, base image (ghcr.io/openhands/agent-server) unchanged.
IMAGE="openhands-agy-worker:1.1.20"
VOLUME_GEMINI="openhands-agy-gemini-config"
VOLUME_WS="openhands-agy-workspace-a2"          # own volume, not the original's
WS_DEST="/workspace"
# Pins the provenance of IMAGE itself (the audited Gate A1a build).
EXPECTED_BASE_ID="sha256:885b3a9a8d47146b1f3058e647b101c8c361fc5d8857fadedb8d5b57131d5822"
AGY_TIMEOUT="${A2_AGY_TIMEOUT:-300}"

# Everything that is not the envelope goes to stderr.
log() { echo "$@" >&2; }

usage() { log "Usage: $0 \"<task>\" | teardown"; exit 1; }

require_base_image() {
  local actual
  actual="$(docker image inspect "$IMAGE" --format '{{.Id}}' 2>/dev/null || true)"
  if [ "$actual" != "$EXPECTED_BASE_ID" ]; then
    log "[ERROR] Image $IMAGE missing or ID no longer matches the audited build."
    exit 1
  fi
}

require_token_volume() {
  if ! docker volume inspect "$VOLUME_GEMINI" >/dev/null 2>&1; then
    log "[ERROR] Token volume $VOLUME_GEMINI missing — run the login harness first."
    exit 1
  fi
}

# Fresh throwaway workspace, owned by the worker user (ADR 4: disposable).
reset_ws_volume() {
  if docker volume inspect "$VOLUME_WS" >/dev/null 2>&1; then
    log "[NOTE] Resetting workspace volume $VOLUME_WS."
    docker volume rm "$VOLUME_WS" >/dev/null
  fi
  docker volume create "$VOLUME_WS" >/dev/null
  docker run --rm --network none -u 0:0 --read-only \
    --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
    --security-opt no-new-privileges \
    --entrypoint /bin/sh -v "$VOLUME_WS:$WS_DEST" "$IMAGE" \
    -c "chown 10001:10001 $WS_DEST && chmod 700 $WS_DEST" >&2

  if [ -n "${A2_PROJECT_DIR:-}" ] && [ -d "$A2_PROJECT_DIR" ]; then
    log "[NOTE] Copying project files from $A2_PROJECT_DIR into workspace volume."
    docker run --rm -v "$VOLUME_WS:$WS_DEST" -v "$A2_PROJECT_DIR:/src:ro" \
      --entrypoint /bin/sh "$IMAGE" \
      -c "tar --exclude='.git' --exclude='__pycache__' --exclude='.pytest_cache' --exclude='.venv' --exclude='.env' --exclude='.env.*' --exclude='.claude/worktrees' -cf - -C /src . | tar -xf - -C $WS_DEST/ && chown -R 10001:10001 $WS_DEST" >&2
  fi
}

# The in-container sequence. Single-quoted heredoc: NOTHING expands on the host;
# every variable resolves inside the container. agy output -> stderr, so the
# only thing on stdout is the envelope.
CONTAINER_SCRIPT='
set -u
cd /workspace || { echo "cd /workspace failed" >&2; exit 90; }
GIT="git -c user.email=a2-worker@local -c user.name=A2Worker -c init.defaultBranch=main"
$GIT init -q . || { echo "git init failed" >&2; exit 91; }
$GIT add -A || true
$GIT commit -q --allow-empty -m baseline || { echo "baseline commit failed" >&2; exit 92; }
baseline_hash="$($GIT rev-parse HEAD)"

# Write mode (A2_ALLOW_WRITE=1) lets agy actually write code; default is the
# null-write test (no skip-permissions -> agy cannot write without a TTY).
# --model pinned to gemini-3.7-flash-high (Alex, 2026-08-25). High reasoning
# over Medium/Low: this worker does real implementation work, not just chat.
agy_flags="--add-dir /workspace --model gemini-3.7-flash-high"
if [ "${A2_ALLOW_WRITE:-0}" = "1" ]; then
  agy_flags="$agy_flags --dangerously-skip-permissions"
fi

agy_exit=skipped
if [ "${A2_SKIP_AGY:-0}" = "1" ]; then
  echo "[SELF-TEST] A2_SKIP_AGY=1 — agy call skipped." >&2
else
  # stdin closed, no TTY. >&2 keeps agy output off stdout (stdout = envelope only).
  timeout '"$AGY_TIMEOUT"'s /usr/local/bin/agy \
    --log-file /home/openhands/.gemini/worker.log \
    $agy_flags -p "$A2_TASK" >&2 </dev/null
  agy_exit=$?
fi

$GIT add -A || true
$GIT commit -q --allow-empty -m "agy run result" || echo "result commit failed" >&2

files="$($GIT ls-files | tr "\n" " ")"
clean_run=false
if [ "$agy_exit" = "skipped" ] || [ "$agy_exit" = "0" ]; then clean_run=true; fi

test_log_detail=""
if [ -n "${A2_TEST_CMD:-}" ]; then
  echo "[TEST-CMD] Executing in-container: $A2_TEST_CMD" >&2
  set +e
  test_out=$(eval "$A2_TEST_CMD" 2>&1)
  test_exit=$?
  set -e
  if [ "$test_exit" = "0" ]; then tp=true; else tp=false; fi
  test_log_detail="[exit ${test_exit}]\n${test_out}"
else
  if [ "${A2_ALLOW_WRITE:-0}" = "1" ]; then
    if [ -n "$files" ] && [ "$clean_run" = true ]; then tp=true; else tp=false; fi
    if [ "$tp" = true ]; then
      boundary="Coding-Task: agy hat geschrieben (Dateien: ${files}, agy exit ${agy_exit})"
    elif [ "$clean_run" != true ]; then
      boundary="Coding-Task FEHLGESCHLAGEN: agy exit=${agy_exit} (Absturz/Timeout?)"
    else
      boundary="Coding-Task FEHLGESCHLAGEN: agy hat nichts geschrieben (Workspace leer)"
    fi
  else
    if [ -z "$files" ] && [ "$clean_run" = true ]; then tp=true; else tp=false; fi
    if [ "$tp" = true ]; then
      boundary="Berechtigungsgrenze: hielt (Workspace leer, agy exit ${agy_exit})"
    elif [ -n "$files" ]; then
      boundary="Berechtigungsgrenze: VERLETZT (Dateien: ${files})"
    else
      boundary="UNKLAR: Workspace leer, aber agy exit=${agy_exit} (Absturz/Timeout?)"
    fi
  fi
  test_log_detail="${boundary}"
fi

# DIFF and TESTLOG are base64 (single line) so their content can never collide
# with the ===A2-...=== markers (a real diff may contain those strings).
# Diff against baseline_hash, NOT HEAD~1: agy may follow the target
# projects own git rules (own branch, own commit) before this scripts
# final --allow-empty commit lands on top -- HEAD~1..HEAD would then be
# empty even though real work happened further back. baseline_hash is
# always an ancestor of HEAD regardless of branch switches in between
# (verified 2026-08-21 against a real cwa-alexandria run where agy did
# exactly this). NOTE: this comment sits inside a single-quoted heredoc
# (CONTAINER_SCRIPT) -- no apostrophes allowed anywhere in this block.
diff_b64=$($GIT --no-pager diff "$baseline_hash" HEAD 2>/dev/null | base64 | tr -d "\n")
testlog="agy exit: ${agy_exit}
workspace files: ${files}
${test_log_detail}"
testlog_b64=$(printf "%s" "$testlog" | base64 | tr -d "\n")

# --- envelope on stdout ---
printf "===A2-COMMITTED===\ntrue\n"
printf "===A2-TESTS-PASSED===\n%s\n" "$tp"
printf "===A2-DIFF-B64===\n%s\n" "$diff_b64"
printf "===A2-TESTLOG-B64===\n%s\n" "$testlog_b64"
printf "===A2-END===\n"
'

case "${1:-}" in
  "") usage ;;

  teardown)
    if docker volume inspect "$VOLUME_WS" >/dev/null 2>&1; then
      docker volume rm "$VOLUME_WS" >/dev/null && log "[OK] Removed $VOLUME_WS."
    else
      log "[OK] $VOLUME_WS already absent."
    fi
    log "[NOTE] Token volume $VOLUME_GEMINI left untouched."
    ;;

  # Any other first arg IS the task — matches the orchestrator's worker contract
  # in adapters.py: the command is invoked as  <worker_cmd> "<task>".
  *)
    task="$1"
    require_base_image
    require_token_volume
    log "=== [A2 RUN] agy worker (no skip-permissions, local git) ==="
    reset_ws_volume

    # Prepend the curated worker-safe rules excerpt (build-worker-rules.sh),
    # if it has been generated — the container has no other access to rules/.
    rules_excerpt=""
    if [ -f "$SCRIPT_DIR/worker-rules.generated.md" ]; then
      rules_excerpt="$(cat "$SCRIPT_DIR/worker-rules.generated.md")

"
    fi

    # Prepend the TARGET PROJECT's own AGENTS.md/CLAUDE.md/README.md, if it
    # has one (Alex, 2026-08-19: "was können wir tun, damit Agent und Reviewer
    # sich im Projekt gut zurechtfinden"). Distinct from rules_excerpt above,
    # which is this KIT's own generic rules — this is the target project's
    # own self-description, written specifically for AI-agent onboarding.
    # AGENTS.md preferred (already-resolved text, no @-import syntax to choke
    # on); CLAUDE.md/README.md as fallback if it doesn't exist. Read from the
    # host path (still available here, before the tar copy-in) — not from
    # inside the container, which has no direct host filesystem access.
    project_context=""
    if [ -n "${A2_PROJECT_DIR:-}" ]; then
      for candidate in AGENTS.md CLAUDE.md README.md; do
        if [ -f "$A2_PROJECT_DIR/$candidate" ]; then
          project_context="=== PROJEKT-KONTEXT ($candidate) ===
$(cat "$A2_PROJECT_DIR/$candidate")

"
          break
        fi
      done
    fi

    prompt="${rules_excerpt}${project_context}${task}"

    # Fold round memory into the prompt so REVISE rounds differ (AK4).
    if [ -n "${A2_MEMORY:-}" ] && [ "${A2_MEMORY}" != "[]" ]; then
      prompt="$prompt

Kontext aus vorherigen Runden (Findings, als JSON): ${A2_MEMORY}"
    fi

    # ONE container run; its stdout (the envelope) becomes our stdout.
    docker run --rm --platform linux/arm64 --read-only \
      --cap-drop ALL --security-opt no-new-privileges \
      --tmpfs /tmp:uid=10001,gid=10001,mode=1777 \
      --tmpfs /home/openhands:uid=10001,gid=10001,mode=700 \
      --tmpfs /home/openhands/.cache:uid=10001,gid=10001,mode=700 \
      -u 10001:10001 -e HOME=/home/openhands -w "$WS_DEST" \
      -e A2_TASK="$prompt" -e "A2_SKIP_AGY=${A2_SKIP_AGY:-0}" \
      -e "A2_ALLOW_WRITE=${A2_ALLOW_WRITE:-0}" \
      -v "$VOLUME_GEMINI:/home/openhands/.gemini" \
      -v "$VOLUME_WS:$WS_DEST" \
      --entrypoint /bin/sh "$IMAGE" -c "$CONTAINER_SCRIPT" </dev/null

    log "[OK] A2 run finished."
    ;;
esac
