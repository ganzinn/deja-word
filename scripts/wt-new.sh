#!/usr/bin/env bash
#
# git worktree を新規作成し、deja-word 用のセットアップを一括で行う。
#
#   Usage: scripts/wt-new.sh <feature-name> [base-branch]
#     例: scripts/wt-new.sh quiz-timer        -> branch feat/quiz-timer, dir ../deja-word-quiz-timer
#         scripts/wt-new.sh fix-foo main      -> base を main にする（既定も main）
#
# 行うこと:
#   1. worktree 作成（branch feat/<name>, dir <repo>/../deja-word-<name>）
#   2. .env / .env.test を本体からコピー
#   3. .env に DEV_BLOB_ROOT を追記し、発音音源を本体 .dev-blob と共有
#   4. mise trust + pnpm install（postinstall で prisma generate も走る）
#
# 前提: docker の deja-word-db が起動済み（DB は本体と共有する）。
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: scripts/wt-new.sh <feature-name> [base-branch]" >&2
  exit 1
fi

NAME="$1"
BASE="${2:-main}"
BRANCH="feat/${NAME}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_DIR="${REPO_ROOT}/../deja-word-${NAME}"

if [ -e "$WORKTREE_DIR" ]; then
  echo "error: directory already exists: $WORKTREE_DIR" >&2
  exit 1
fi
if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "error: branch already exists: ${BRANCH}" >&2
  exit 1
fi

echo "==> Creating worktree: ${BRANCH} -> ${WORKTREE_DIR} (base: ${BASE})"
git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE_DIR" "$BASE"

# worktree add 直後はパスにシンボリックリンク等が含まれ得るので絶対パスへ正規化
WORKTREE_DIR="$(cd "$WORKTREE_DIR" && pwd)"

echo "==> Copying env files"
for f in .env .env.test; do
  if [ -f "${REPO_ROOT}/${f}" ]; then
    cp "${REPO_ROOT}/${f}" "${WORKTREE_DIR}/${f}"
    echo "    copied ${f}"
  else
    echo "    skip ${f} (not found in repo root)"
  fi
done

echo "==> Sharing .dev-blob with main repo via DEV_BLOB_ROOT"
ENV_FILE="${WORKTREE_DIR}/.env"
BLOB_LINE="DEV_BLOB_ROOT=\"${REPO_ROOT}/.dev-blob\""
if [ -f "$ENV_FILE" ] && grep -q '^DEV_BLOB_ROOT=' "$ENV_FILE"; then
  # 既存行を置換（macOS / GNU 両対応のため一時ファイル経由）
  grep -v '^DEV_BLOB_ROOT=' "$ENV_FILE" > "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
fi
printf '\n# git worktree: 発音音源を本体と共有（scripts/wt-new.sh が設定）\n%s\n' "$BLOB_LINE" >> "$ENV_FILE"

echo "==> Setting up toolchain in worktree"
(
  cd "$WORKTREE_DIR"
  if command -v mise >/dev/null 2>&1; then
    # 既に信頼済み（本体と同一の .mise.toml）の場合 mise trust は exit 1 を返すため
    # 非致命化する。set -e 下で install まで到達させるのが目的。
    mise trust || true
  fi
  pnpm install
)

cat <<EOF

✅ Worktree ready: ${WORKTREE_DIR}

Next steps:
  cd ${WORKTREE_DIR}
  pnpm db:migrate     # このブランチの pending migration を共有 DB に適用
  pnpm dev

DB は本体と共有しています。ブランチ間で migration が食い違って drift が出た場合:
  pnpm prisma migrate reset && pnpm db:seed

撤去するとき:
  scripts/wt-rm.sh ${NAME} [--delete-branch]
EOF
