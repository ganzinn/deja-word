#!/usr/bin/env bash
# s3-overturn-word-bookmark 機械判定（凍結 2026-07-08）
# 確定事項の覆し（01 決定 2: 専用ページ /bookmarks → 単語一覧のフィルタに統合）の伝播を検証する
# usage: checks.sh <worktree> <base_sha>   exit 0 = pass
set -u
WT=$1
BASE=$2
DIR="$WT/docs/design/word-bookmark"
HUB="$DIR/README.md"
T01="$DIR/01-requirements.md"
T03="$DIR/03-ui.md"
T04="$DIR/04-architecture.md"
F=0
fail() { echo "FAIL $1"; F=1; }

for f in "$HUB" "$T01" "$T03" "$T04"; do
  [ -f "$f" ] || { fail "c0_missing:$f"; exit 1; }
done
NEW='フィルタ|絞り込み'

# c1: ハブから旧決定（専用ページ /bookmarks）が消え、新決定がサマリに入っている
grep -q '/bookmarks' "$HUB" && fail "c1_hub_old_remains"
awk '/^## 確定事項サマリ/,/^## トピック状態表/' "$HUB" | grep -Eq "$NEW" || fail "c1_hub_new_missing"

# c2: 元トピック 01 が更新され、新決定が反映されている
git -C "$WT" diff --name-only "$BASE"..HEAD | grep -q '01-requirements\.md' || fail "c2_origin_not_updated"
grep -Eq "$NEW" "$T01" || fail "c2_origin_new_missing"

# c3: 前提に再掲していた 03・04 が更新されている（旧決定が前提から消え、新決定が入る）
awk '/^## 前提/,/^## 検討事項リスト/' "$T03" | grep -q '/bookmarks' && fail "c3_premise03_old_remains"
awk '/^## 前提/,/^## 検討事項リスト/' "$T04" | grep -q '/bookmarks' && fail "c3_premise04_old_remains"
awk '/^## 前提/,/^## 検討事項リスト/' "$T04" | grep -Eq "$NEW" || fail "c3_premise04_new_missing"

# c4: 03 に覆しを含む決定が「決定 N:」見出しで記録され、採用理由・却下案がある
N=$(grep -Ec '^#{2,4} 決定 [0-9]+:' "$T03")
[ "$N" -ge 2 ] || fail "c4_decision_headings:${N}<2"
DECISIONS=$(awk '/^##+ 決定 [0-9]+:/{f=1} f{print}' "$T03")
echo "$DECISIONS" | grep -q '採用' || fail "c4_adoption_reason"
echo "$DECISIONS" | grep -q '却下' || fail "c4_rejected_alternative"

# c5: 03 が日付付きで確定、ハブ状態表の 03 行も確定
grep -q '状態: \*\*確定\*\*' "$T03" || fail "c5_state_fixed"
grep -q '2026-' "$T03" || fail "c5_state_date"
grep -E '03-ui\.md\)' "$HUB" | grep -q '確定' || fail "c5_hub_row_fixed"

# c6: 次セッションの推奨トピックが 04 に更新されている
grep -q '次セッションの推奨トピック: 04' "$HUB" || fail "c6_next_topic_04"

# c7: コミットが存在し、メッセージが「word-bookmark 設計: 03 …」型
git -C "$WT" log --format=%s "$BASE"..HEAD | grep -Eq '^word-bookmark 設計: 03' || fail "c7_commit_subject"

# c8: 作業ツリーがクリーン
[ -z "$(git -C "$WT" status --porcelain)" ] || fail "c8_clean_tree"

# c9: 変更が docs/design/word-bookmark/ に限定されている
OUT=$(git -C "$WT" diff --name-only "$BASE"..HEAD | grep -v '^docs/design/word-bookmark/')
[ -z "$OUT" ] || fail "c9_scope:$OUT"

exit $F
