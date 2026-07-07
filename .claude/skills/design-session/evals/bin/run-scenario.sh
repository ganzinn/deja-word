#!/usr/bin/env bash
# design-session skill eval: 1 シナリオを隔離 worktree で実行し、判定材料を run-dir に収集する
# usage: evals/bin/run-scenario.sh <scenario-dir> <run-dir>
# 前提: リポジトリ内で実行。claude CLI / jq が利用可能であること
set -uo pipefail

SCEN=$(cd "$1" && pwd) || exit 2
mkdir -p "$2"
RUN_DIR=$(cd "$2" && pwd)

REPO=$(git rev-parse --show-toplevel)
SKILL_SRC="$REPO/.claude/skills/design-session"
FEATURE=$(cat "$SCEN/feature.txt")
TS=$(date +%Y%m%d-%H%M%S)
WT="$REPO/../deja-word-eval-$TS"
BRANCH="eval/run-$TS"

cleanup() {
  git -C "$REPO" worktree remove --force "$WT" 2>/dev/null
  git -C "$REPO" branch -D "$BRANCH" 2>/dev/null
}
git -C "$REPO" worktree add -b "$BRANCH" "$WT" main >/dev/null 2>&1 || { echo "worktree add failed" >&2; exit 2; }
trap cleanup EXIT

# 改善候補の skill を worktree に反映する（evals/ は持ち込まない）
rm -rf "$WT/.claude/skills/design-session"
mkdir -p "$WT/.claude/skills/design-session"
cp "$SKILL_SRC/SKILL.md" "$WT/.claude/skills/design-session/"
cp -R "$SKILL_SRC/templates" "$WT/.claude/skills/design-session/"

# fixture（事前状態）の配置
if [ -d "$SCEN/fixture" ]; then
  cp -R "$SCEN/fixture/docs" "$WT/"
fi
git -C "$WT" add -A
git -C "$WT" commit -q -m "eval setup（候補 skill + fixture）" --no-verify
BASE=$(git -C "$WT" rev-parse HEAD)

{
  echo "date: $(date +%Y-%m-%dT%H:%M:%S)"
  echo "claude: $(claude -v 2>/dev/null)"
  echo "model: claude-opus-4-8"
  echo "scenario: $(basename "$SCEN")"
  echo "base: $BASE"
  echo "skill_sha1: $(shasum "$SKILL_SRC/SKILL.md" | cut -d' ' -f1)"
} > "$RUN_DIR/meta.txt"

ALLOWED="Read Write Edit Glob Grep Task TodoWrite Bash(git status:*) Bash(git log:*) Bash(git diff:*) Bash(git add:*) Bash(git commit:*) Bash(ls:*)"
DISALLOWED="WebSearch WebFetch Bash(git push:*)"

(
  cd "$WT" && claude -p "$(cat "$SCEN/prompt.txt")" \
    --model claude-opus-4-8 \
    --permission-mode acceptEdits \
    --allowedTools "$ALLOWED" \
    --disallowedTools "$DISALLOWED" \
    --max-budget-usd 15 \
    --no-session-persistence \
    --output-format stream-json --verbose \
    > "$RUN_DIR/transcript.jsonl" 2> "$RUN_DIR/stderr.txt"
)
EXEC_EXIT=$?
echo "exec_exit: $EXEC_EXIT" >> "$RUN_DIR/meta.txt"

# 機械 check（シナリオ固有）
bash "$SCEN/checks.sh" "$WT" "$BASE" > "$RUN_DIR/checks-output.txt" 2>&1
CHECKS_EXIT=$?

# 機械 check（transcript 共通）
SUBTYPE=$(jq -r 'select(.type=="result") | .subtype' "$RUN_DIR/transcript.jsonl" 2>/dev/null | tail -1)
ASKUSER=$(jq -s '[.[] | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .name=="AskUserQuestion")] | length' "$RUN_DIR/transcript.jsonl" 2>/dev/null)
DENIALS=$(jq -r 'select(.type=="result") | .permission_denials | length' "$RUN_DIR/transcript.jsonl" 2>/dev/null | tail -1)
COST=$(jq -r 'select(.type=="result") | .total_cost_usd' "$RUN_DIR/transcript.jsonl" 2>/dev/null | tail -1)
{
  echo "---- transcript checks ----"
  echo "result_subtype: ${SUBTYPE:-missing}"
  echo "askuserquestion_count: ${ASKUSER:-?}"
  echo "permission_denials: ${DENIALS:-?}"
  echo "cost_usd: ${COST:-?}"
  [ "$EXEC_EXIT" = "0" ] || echo "FAIL t0_exec_exit (INFRA)"
  [ "${SUBTYPE:-}" = "success" ] || echo "FAIL t1_result_subtype"
  [ "${ASKUSER:-1}" = "0" ] || echo "FAIL t2_askuserquestion"
  [ "${DENIALS:-1}" = "0" ] || echo "FAIL t3_permission_denials (INFRA)"
} >> "$RUN_DIR/checks-output.txt"

# 成果物スナップショット・コミットログ・要約
if [ -d "$WT/docs/design/$FEATURE" ]; then
  rm -rf "$RUN_DIR/artifact"
  mkdir -p "$RUN_DIR/artifact"
  cp -R "$WT/docs/design/$FEATURE" "$RUN_DIR/artifact/"
fi
git -C "$WT" log -p --stat "$BASE"..HEAD > "$RUN_DIR/commits.txt" 2>/dev/null
bash "$(cd "$(dirname "$0")" && pwd)/summarize-transcript.sh" "$RUN_DIR/transcript.jsonl" > "$RUN_DIR/transcript-summary.md" 2>/dev/null

echo "== $(basename "$SCEN"): exec=$EXEC_EXIT checks=$CHECKS_EXIT subtype=${SUBTYPE:-?} askuser=${ASKUSER:-?} denials=${DENIALS:-?} cost=${COST:-?}"
[ "$EXEC_EXIT" = "0" ] && [ "$CHECKS_EXIT" = "0" ] && [ "${SUBTYPE:-}" = "success" ] && [ "${ASKUSER:-1}" = "0" ] && [ "${DENIALS:-1}" = "0" ]
