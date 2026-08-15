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
#
# 未コミットの変更・追跡外ファイルが残っている worktree は、一覧を出して撤去を
# 中断する（gitignore 対象のファイルは対象外）。
#
# worktree 内から実行してもよい（パスは本体基準で解決される）。ただし撤去対象の
# worktree 自身の中から実行すると、撤去は成功するが自分の cwd が消えた状態になり
# 以降のコマンドが失敗する。撤去対象の外から実行すること。
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

# 本体（メイン worktree）の root = git-common-dir（メイン側 .git）の親。
# show-toplevel は実行場所の worktree root になるため使わない（wt-new.sh と同方式）。
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
REPO_ROOT="$(dirname "$GIT_COMMON_DIR")"
WORKTREE_DIR="${REPO_ROOT}/../deja-word-worktrees/${NAME}"

if [ ! -d "$WORKTREE_DIR" ]; then
  echo "error: worktree directory not found: $WORKTREE_DIR" >&2
  exit 1
fi

# 直接 rm するフォールバック（後述）があるため、対象が本当にこのリポジトリの
# worktree の root かを先に確かめる（別リポジトリの中の素のディレクトリを指した
# 場合、git は親リポジトリを答えるので toplevel の一致まで見る）。
WORKTREE_ABS="$(cd "$WORKTREE_DIR" && pwd -P)"
if ! WORKTREE_TOP="$(git -C "$WORKTREE_DIR" rev-parse --show-toplevel 2>/dev/null)" ||
  [ "$WORKTREE_TOP" != "$WORKTREE_ABS" ] ||
  [ "$(git -C "$WORKTREE_DIR" rev-parse --path-format=absolute --git-common-dir)" != "$GIT_COMMON_DIR" ]; then
  echo "error: not a worktree of ${REPO_ROOT}: $WORKTREE_DIR" >&2
  exit 1
fi

# 未コミットの成果物を巻き込まないための検査。git worktree remove 自身も同じ判定で
# 撤去を拒むが、こちらは何が残っているかを一覧で見せて中断する。
DIRTY="$(git -C "$WORKTREE_DIR" status --porcelain)"
if [ -n "$DIRTY" ]; then
  echo "error: worktree has uncommitted changes or untracked files:" >&2
  echo "$DIRTY" >&2
  echo "hint: コミット / stash するか、不要なら手で削除してから再実行する" >&2
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
# git worktree remove は中身を消してから最後にディレクトリを rmdir する。macOS が
# その最中に .DS_Store を作り直すと rmdir が "Directory not empty" で失敗し、git の
# 登録だけ外れてディレクトリが残る。上の検査で clean と分かっているので、失敗時は
# 自前で削除して prune（下）で辻褄を合わせる。
if ! git -C "$REPO_ROOT" worktree remove "$WORKTREE_DIR"; then
  echo "warning: git worktree remove failed; removing the directory directly" >&2
  rm -rf "$WORKTREE_ABS"
fi

# ディレクトリを自前で消した場合は worktree の登録が残っており、そのままでは
# 「ブランチが worktree で使用中」としてブランチ削除が拒まれる。prune を先に置く。
git -C "$REPO_ROOT" worktree prune

if [ "$DELETE_BRANCH" = "true" ]; then
  echo "==> Deleting branch: ${BRANCH}"
  git -C "$REPO_ROOT" branch -d "$BRANCH"
fi

echo "✅ Done."
