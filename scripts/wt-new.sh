#!/usr/bin/env bash
#
# git worktree を新規作成し、deja-word 用のセットアップを一括で行う。
# 引数の組み合わせ・使い分けは共通スキル .claude/skills/worktree/ を参照。
#
#   Usage: scripts/wt-new.sh <name> [base-branch] [--branch <branch>] [--no-install]
#     例: scripts/wt-new.sh quiz-timer
#           -> branch feat/quiz-timer, dir ../deja-word-worktrees/quiz-timer, base main
#         scripts/wt-new.sh foo-design origin/main --branch docs/foo-design-plan --no-install
#           -> 任意ブランチ名・origin/main 起点（自動 fetch）・pnpm install なし
#
#   --branch <branch>  作成するブランチ名（既定: feat/<name>）。既存ブランチなら
#                      base を無視してそのブランチを checkout する（継続作業）
#   --no-install       pnpm install を行わない（ドキュメント作業のみの worktree 用。
#                      コードの実行・検証が必要になったら worktree 内で pnpm install）
#
# 行うこと:
#   1. worktree 作成（dir <repo>/../deja-word-worktrees/<name>）。
#      base が origin/* なら先に git fetch する
#   2. .env / .env.test / .claude/settings.local.json の供給
#      （scripts/wt-env.sh — コピー＋DEV_BLOB_ROOT 共有）
#   3. mise trust + pnpm install（postinstall で prisma generate も走る。
#      --no-install 時はどちらも省略）
#
# 途中で失敗しても作成済み worktree は残る（検査後 scripts/wt-rm.sh で撤去）。
# 前提: pnpm install する場合は docker の deja-word-db が起動済み（DB は本体と共有する）。
set -euo pipefail

usage() {
  echo "Usage: scripts/wt-new.sh <name> [base-branch] [--branch <branch>] [--no-install]" >&2
  exit 1
}

BRANCH=""
INSTALL="true"
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --branch)
      [ $# -ge 2 ] || usage
      BRANCH="$2"
      shift 2
      ;;
    --no-install)
      INSTALL="false"
      shift
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

[ "${#POSITIONAL[@]}" -ge 1 ] && [ "${#POSITIONAL[@]}" -le 2 ] || usage
NAME="${POSITIONAL[0]}"
BASE="${POSITIONAL[1]:-main}"
[ -n "$BRANCH" ] || BRANCH="feat/${NAME}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_DIR="${REPO_ROOT}/../deja-word-worktrees/${NAME}"

if [ -e "$WORKTREE_DIR" ]; then
  echo "error: directory already exists: $WORKTREE_DIR" >&2
  exit 1
fi
mkdir -p "${REPO_ROOT}/../deja-word-worktrees"

if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  # 既存ブランチ: base は使わず checkout（別 worktree で checkout 済みなら git がエラーにする）
  echo "==> Creating worktree: ${BRANCH} (existing branch) -> ${WORKTREE_DIR}"
  git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" "$BRANCH"
else
  case "$BASE" in
    origin/*)
      echo "==> Fetching ${BASE}"
      git -C "$REPO_ROOT" fetch origin "${BASE#origin/}"
      ;;
  esac
  echo "==> Creating worktree: ${BRANCH} -> ${WORKTREE_DIR} (base: ${BASE})"
  git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE_DIR" "$BASE"
fi

# worktree add 直後はパスにシンボリックリンク等が含まれ得るので絶対パスへ正規化
WORKTREE_DIR="$(cd "$WORKTREE_DIR" && pwd)"

echo "==> Supplying env files (wt-env.sh)"
"${REPO_ROOT}/scripts/wt-env.sh" "$WORKTREE_DIR"

if [ "$INSTALL" = "true" ]; then
  echo "==> Setting up toolchain in worktree"
  (
    cd "$WORKTREE_DIR"
    if command -v mise >/dev/null 2>&1; then
      # mise trust は信頼済み・未信頼のどちらでも exit 0（信頼済みは警告のみ）。
      # 想定外の失敗でも set -e 下で install まで到達させるため非致命化は残す。
      mise trust || true
    fi
    pnpm install
  )
fi

echo
echo "✅ Worktree ready: ${WORKTREE_DIR}"
if [ "$INSTALL" = "true" ]; then
  cat <<EOF

Next steps:
  cd ${WORKTREE_DIR}
  pnpm db:migrate     # このブランチの pending migration を共有 DB に適用
  pnpm dev

DB は本体と共有しています。ブランチ間で migration が食い違って drift が出た場合:
  pnpm prisma migrate reset && pnpm db:seed
EOF
fi
cat <<EOF

撤去するとき:
  scripts/wt-rm.sh ${NAME} [--delete-branch]
EOF
