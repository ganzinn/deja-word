#!/usr/bin/env bash
#
# git worktree に .env / .env.test / .claude/settings.local.json を供給する。
#
#   Usage: scripts/wt-env.sh [worktree-dir]   # 省略時はカレントディレクトリ
#
# 行うこと:
#   1. .env / .env.test / .claude/settings.local.json（Claude Code の
#      permission 許可リスト）が無ければ本体（メイン worktree）からコピー
#      （既存ファイルは上書きしない — worktree 側のローカル調整を壊さないため。
#       一方向コピーなので、worktree 側で増えた承認は本体には戻らない）
#   2. .env の DEV_BLOB_ROOT を本体の .dev-blob へ向ける（既存行は置換）
#      発音音源は DB に相対 key だけが入るため、本体と共有しないと 404 になる
#      （src/lib/blob-client.ts 参照）
#
# 呼び出し元: scripts/wt-new.sh（worktree 新規作成時）、
# devman の setup（dev サーバを worktree に切替えるとき。docs/ops/devman.md 参照）、
# ticket-implement スキルの worktree 準備（.claude/skills/ticket-implement/SKILL.md）。
# メイン worktree 自身に対して実行された場合は何もしない。
set -euo pipefail

TARGET_DIR="${1:-.}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

# メイン worktree の root は git-common-dir（メイン側 .git）の親
GIT_COMMON_DIR="$(git -C "$TARGET_DIR" rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(dirname "$GIT_COMMON_DIR")"

if [ "$TARGET_DIR" = "$MAIN_ROOT" ]; then
  echo "wt-env: main worktree itself, nothing to do"
  exit 0
fi

for f in .env .env.test .claude/settings.local.json; do
  if [ -f "${TARGET_DIR}/${f}" ]; then
    echo "wt-env: keep existing ${f}"
  elif [ -f "${MAIN_ROOT}/${f}" ]; then
    mkdir -p "$(dirname "${TARGET_DIR}/${f}")"
    cp "${MAIN_ROOT}/${f}" "${TARGET_DIR}/${f}"
    echo "wt-env: copied ${f} from ${MAIN_ROOT}"
  else
    echo "wt-env: skip ${f} (not found in main worktree)"
  fi
done

ENV_FILE="${TARGET_DIR}/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "wt-env: no .env, skip DEV_BLOB_ROOT setup"
  exit 0
fi

BLOB_LINE="DEV_BLOB_ROOT=\"${MAIN_ROOT}/.dev-blob\""
if grep -qxF "$BLOB_LINE" "$ENV_FILE"; then
  echo "wt-env: DEV_BLOB_ROOT already set"
  exit 0
fi
if grep -q '^DEV_BLOB_ROOT=' "$ENV_FILE"; then
  # 既存行を置換（macOS / GNU 両対応のため一時ファイル経由）
  grep -v '^DEV_BLOB_ROOT=' "$ENV_FILE" > "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
fi
printf '\n# git worktree: 発音音源を本体と共有（scripts/wt-env.sh が設定）\n%s\n' "$BLOB_LINE" >> "$ENV_FILE"
echo "wt-env: DEV_BLOB_ROOT -> ${MAIN_ROOT}/.dev-blob"
