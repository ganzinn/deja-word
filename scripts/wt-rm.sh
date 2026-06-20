#!/usr/bin/env bash
#
# scripts/wt-new.sh で作った git worktree を撤去する。
#
#   Usage: scripts/wt-rm.sh <feature-name> [--delete-branch]
#     例: scripts/wt-rm.sh quiz-timer                  -> worktree のみ削除
#         scripts/wt-rm.sh quiz-timer --delete-branch  -> branch feat/quiz-timer も削除
#
# .dev-blob は本体の実体を DEV_BLOB_ROOT で参照しているだけなので、worktree を
# 消しても共有音源・共有 DB のデータは失われない。
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: scripts/wt-rm.sh <feature-name> [--delete-branch]" >&2
  exit 1
fi

NAME="$1"
DELETE_BRANCH="false"
if [ "${2:-}" = "--delete-branch" ]; then
  DELETE_BRANCH="true"
fi
BRANCH="feat/${NAME}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_DIR="${REPO_ROOT}/../deja-word-${NAME}"

echo "==> Removing worktree: ${WORKTREE_DIR}"
git -C "$REPO_ROOT" worktree remove "$WORKTREE_DIR"

if [ "$DELETE_BRANCH" = "true" ]; then
  echo "==> Deleting branch: ${BRANCH}"
  git -C "$REPO_ROOT" branch -d "$BRANCH"
fi

git -C "$REPO_ROOT" worktree prune
echo "✅ Done."
