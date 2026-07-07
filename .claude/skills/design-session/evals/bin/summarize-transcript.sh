#!/usr/bin/env bash
# stream-json transcript を人間可読な要約に変換する（実行エージェントの発話とツール呼び出しのみ）
# usage: summarize-transcript.sh <transcript.jsonl>
set -euo pipefail

jq -r '
  if .type == "assistant" then
    (.message.content[]? |
      if .type == "text" then "\n#### assistant\n" + .text
      elif .type == "tool_use" then "- TOOL " + .name + " " + ((.input | tostring)[0:200])
      else empty end)
  elif .type == "result" then
    "\n---\nresult: subtype=" + (.subtype // "?")
      + " cost_usd=" + ((.total_cost_usd // 0) | tostring)
      + " turns=" + ((.num_turns // 0) | tostring)
      + " denials=" + ((.permission_denials // []) | length | tostring)
  else empty end
' "$1"
