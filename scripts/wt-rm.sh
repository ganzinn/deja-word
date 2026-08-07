#!/usr/bin/env bash
#
# scripts/wt-new.sh で作った git worktree を撤去する。
#
#   Usage: scripts/wt-rm.sh <name> [--delete-branch]
#     例: scripts/wt-rm.sh quiz-timer                  -> worktree のみ削除
#         scripts/wt-rm.sh quiz-timer --delete-branch  -> worktree に紐づくブランチも削除
#
# <name> は ../deja-word-worktrees/<name> のディレクトリ名。
#
# ブランチ名は worktree にチェックアウト中の実ブランチを git から取得するため、
# feat/ に限らず docs/ ・ fix/ ・ chore/ 等どのプレフィックスでも削除できる。
#
# .dev-blob は本体の実体を DEV_BLOB_ROOT で参照しているだけなので、worktree を
# 消しても共有音源・共有 DB のデータは失われない。
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: scripts/wt-rm.sh <name> [--delete-branch]" >&2
  exit 1
fi

NAME="$1"
DELETE_BRANCH="false"
if [ "${2:-}" = "--delete-branch" ]; then
  DELETE_BRANCH="true"
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_DIR="${REPO_ROOT}/../deja-word-worktrees/${NAME}"

if [ ! -d "$WORKTREE_DIR" ]; then
  echo "error: worktree directory not found: $WORKTREE_DIR" >&2
  exit 1
fi

# worktree 撤去の前に、そこにチェックアウト中の実ブランチ名を取得しておく
# （撤去後は取得できないため順序が重要）。detached HEAD なら symbolic-ref が
# 非ゼロ終了するので、warning を出してブランチ削除だけスキップする。
BRANCH=""
if [ "$DELETE_BRANCH" = "true" ]; then
  if BRANCH="$(git -C "$WORKTREE_DIR" symbolic-ref --quiet --short HEAD)"; then
    :
  else
    echo "warning: worktree is in detached HEAD; skipping branch deletion" >&2
    DELETE_BRANCH="false"
  fi
fi

echo "==> Removing worktree: ${WORKTREE_DIR}"
git -C "$REPO_ROOT" worktree remove "$WORKTREE_DIR"

if [ "$DELETE_BRANCH" = "true" ]; then
  echo "==> Deleting branch: ${BRANCH}"
  git -C "$REPO_ROOT" branch -d "$BRANCH"
fi

git -C "$REPO_ROOT" worktree prune
echo "✅ Done."
