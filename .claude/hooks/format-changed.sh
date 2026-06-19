#!/usr/bin/env bash
# Claude のターン終了時に、変更されたファイルだけ Prettier 整形する。
# .prettierignore / 未対応拡張子はスキップ。失敗してもターンは止めない。
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# 追跡ファイルの変更（削除を除く）＋ 未追跡ファイル を NUL 区切りで集めて prettier に渡す
{
  git diff --name-only -z --diff-filter=d HEAD
  git ls-files --others --exclude-standard -z
} | xargs -0 pnpm exec prettier --write --ignore-unknown >/dev/null 2>&1 || true

exit 0
