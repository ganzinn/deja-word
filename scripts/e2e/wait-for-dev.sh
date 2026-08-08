#!/usr/bin/env bash
#
# dev サーバが応答するまで待つ。
#
#   Usage: pnpm e2e:wait-dev [url] [timeout-sec]
#
#   url         既定: $E2E_BASE_URL → http://localhost:${PORT:-3000}
#   timeout-sec 既定: 90（next dev の初回コンパイルを見込む）
#
# 存在理由: 待ち合わせを `for i in $(seq ...)` のワンライナーで書くと、コマンド置換が
# Claude Code の許可リストで消せず毎回承認プロンプトになる（issue #244）。定型の
# 待ち合わせをここに寄せて `pnpm e2e:wait-dev` 経由で呼ぶことで承認なしに走る。
set -euo pipefail

URL="${1:-${E2E_BASE_URL:-http://localhost:${PORT:-3000}}}"
TIMEOUT="${2:-90}"

for ((i = 1; i <= TIMEOUT; i++)); do
  # 接続できれば up 扱い（/ は未ログインだと 3xx を返すため HTTP status は見ない）
  if curl -s -o /dev/null --max-time 5 "$URL"; then
    echo "wait-for-dev: up after ${i}s (${URL})"
    exit 0
  fi
  sleep 1
done

echo "wait-for-dev: timed out after ${TIMEOUT}s (${URL})" >&2
exit 1
