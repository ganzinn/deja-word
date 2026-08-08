#!/usr/bin/env bash
#
# 指定ポートで待ち受けている dev サーバを停止する。
#
#   Usage: pnpm e2e:stop-dev <port>
#
# ポートは必須（既定値を置くと本体の dev サーバを誤って落とすため）。
#
# 存在理由: 停止を `pkill ...; lsof -ti :PORT | xargs -r kill` の複合コマンドで書くと
# 未許可コマンド＋パイプで毎回承認プロンプトになる（issue #244）。ここに寄せて
# `pnpm e2e:stop-dev <port>` 経由で呼ぶことで承認なしに走る。
set -euo pipefail

PORT="${1:-}"
if [ -z "$PORT" ]; then
  echo "usage: pnpm e2e:stop-dev <port>" >&2
  exit 2
fi
case "$PORT" in
  *[!0-9]* | "")
    echo "stop-dev: port must be a number (got '${PORT}')" >&2
    exit 2
    ;;
esac

listeners() { lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true; }

PIDS="$(listeners)"
if [ -z "$PIDS" ]; then
  echo "stop-dev: nothing listening on :${PORT}"
  exit 0
fi

echo "stop-dev: TERM -> ${PIDS//$'\n'/ } (:${PORT})"
# shellcheck disable=SC2086
kill $PIDS 2>/dev/null || true

for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ -z "$(listeners)" ] && break
  sleep 1
done

PIDS="$(listeners)"
if [ -n "$PIDS" ]; then
  echo "stop-dev: still up, KILL -> ${PIDS//$'\n'/ }"
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null || true
  sleep 1
fi

# next dev は子プロセスを残すことがあるため、同ポートの残骸を回収する
pkill -f "next dev.*${PORT}" 2>/dev/null || true

if [ -n "$(listeners)" ]; then
  echo "stop-dev: failed to free :${PORT}" >&2
  exit 1
fi
echo "stop-dev: :${PORT} is free"
