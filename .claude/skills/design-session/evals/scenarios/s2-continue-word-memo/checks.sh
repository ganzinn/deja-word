#!/usr/bin/env bash
# s2-continue-word-memo 機械判定（凍結 2026-07-08）
# usage: checks.sh <worktree> <base_sha>   exit 0 = pass
set -u
WT=$1
BASE=$2
DIR="$WT/docs/design/word-memo"
HUB="$DIR/README.md"
T02="$DIR/02-data-model.md"
T03="$DIR/03-ui.md"
F=0
fail() { echo "FAIL $1"; F=1; }

for f in "$HUB" "$T02" "$T03"; do
  [ -f "$f" ] || { fail "c0_missing:$f"; exit 1; }
done

# c1: 02 が日付付きで確定になっている
grep -q '状態: \*\*確定\*\*' "$T02" || fail "c1_state_fixed"
grep -q '2026-' "$T02" || fail "c1_state_date"

# c2: 02 に「決定 N:」見出しが 2 件以上ある
N=$(grep -Ec '^#{2,4} 決定 [0-9]+:' "$T02")
[ "$N" -ge 2 ] || fail "c2_decision_headings:${N}<2"

# c3: 02 の決定本文（最初の「決定 N:」見出し以降）に採用理由と却下案が残っている
DECISIONS=$(awk '/^##+ 決定 [0-9]+:/{f=1} f{print}' "$T02")
echo "$DECISIONS" | grep -q '採用' || fail "c3_adoption_reason"
echo "$DECISIONS" | grep -q '却下' || fail "c3_rejected_alternative"

# c4: ハブ状態表の 02 行が確定になっている
grep -E '02-data-model\.md\)' "$HUB" | grep -q '確定' || fail "c4_hub_row_fixed"

# c5: ハブ確定事項サマリに 02 の結論が昇格している
awk '/^## 確定事項サマリ/,/^## トピック状態表/' "$HUB" | grep -q '02-data-model\.md' || fail "c5_hub_summary_promoted"

# c6: 03 の前提に 02 の確定が再掲されている
awk '/^## 前提/,/^## 検討事項リスト/' "$T03" | grep -q '02 確定' || fail "c6_premise_relisted_in_03"

# c7: 次セッションの推奨トピックが 03 に更新されている
grep -q '次セッションの推奨トピック: 03' "$HUB" || fail "c7_next_topic_03"

# c8: コミットが存在し、メッセージが「word-memo 設計: 02 …確定」型
git -C "$WT" log --format=%s "$BASE"..HEAD | grep -Eq '^word-memo 設計: 02.*確定' || fail "c8_commit_subject"

# c9: 作業ツリーがクリーン
[ -z "$(git -C "$WT" status --porcelain)" ] || fail "c9_clean_tree"

# c10: 変更が docs/design/word-memo/ に限定されている
OUT=$(git -C "$WT" diff --name-only "$BASE"..HEAD | grep -v '^docs/design/word-memo/')
[ -z "$OUT" ] || fail "c10_scope:$OUT"

exit $F
