#!/usr/bin/env bash
# holdout3-complete-word-archive 機械判定（封印 2026-07-08）
# 設計完了セッション: 最終トピック確定 → 全確定 → 実装への引き継ぎ追記（ticket-split 下流契約）を検証する
# usage: checks.sh <worktree> <base_sha>   exit 0 = pass
set -u
WT=$1
BASE=$2
DIR="$WT/docs/design/word-archive"
HUB="$DIR/README.md"
T03="$DIR/03-architecture.md"
F=0
fail() { echo "FAIL $1"; F=1; }

for f in "$HUB" "$T03"; do
  [ -f "$f" ] || { fail "c0_missing:$f"; exit 1; }
done

# c1: 状態表の全トピック行が確定になっている（議論中・未着手が残っていない）
TABLE=$(awk 'f && /^## /{f=0} f && /^\|/{print} /^## トピック状態表/{f=1}' "$HUB" | grep -Ev '^\| *(---|ファイル)')
echo "$TABLE" | grep -Eq '議論中|未着手' && fail "c1_unfixed_rows_remain"
N=$(echo "$TABLE" | grep -c '確定')
[ "$N" -ge 3 ] || fail "c1_fixed_rows:${N}<3"

# c2: 実装への引き継ぎセクションが必須要素付きで存在する（ticket-split 契約）
grep -q '## 実装への引き継ぎ' "$HUB" || fail "c2_handoff_section"
HANDOFF=$(awk 'f && /^## /{f=0} f{print} /^## 実装への引き継ぎ/{f=1}' "$HUB")
echo "$HANDOFF" | grep -q '変更対象' || fail "c2_handoff_targets"
echo "$HANDOFF" | grep -q '着手順序' || fail "c2_handoff_order"
echo "$HANDOFF" | grep -q 'テスト戦略' || fail "c2_handoff_test"
echo "$HANDOFF" | grep -q 'ticket-split' || fail "c2_handoff_ticket_split_pointer"
echo "$HANDOFF" | grep -q 'docs/plan/word-archive' || fail "c2_handoff_plan_path"

# c3: 03 が統一形式の日付付きで確定し、決定が「決定 N:」見出し・ラベル付き採用理由・却下案で記録されている
grep -q '状態: \*\*確定\*\*' "$T03" || fail "c3_state_fixed"
grep -q '2026-' "$T03" || fail "c3_state_date"
N=$(grep -Ec '^#{2,4} 決定 [0-9]+:' "$T03")
[ "$N" -ge 1 ] || fail "c3_decision_headings:${N}<1"
DECISIONS=$(awk '/^##+ 決定 [0-9]+:/{f=1} f{print}' "$T03")
echo "$DECISIONS" | grep -q '採用理由' || fail "c3_adoption_reason"
echo "$DECISIONS" | grep -q '却下' || fail "c3_rejected_alternative"

# c4: ハブ確定事項サマリに 03 の結論が昇格している
awk '/^## 確定事項サマリ/,/^## トピック状態表/' "$HUB" | grep -q '03-architecture\.md' || fail "c4_hub_summary_promoted"

# c5: コミットが存在し、メッセージが「word-archive 設計: 」で始まる
git -C "$WT" log --format=%s "$BASE"..HEAD | grep -Eq '^word-archive 設計: ' || fail "c5_commit_subject"

# c6: 作業ツリーがクリーン
[ -z "$(git -C "$WT" status --porcelain)" ] || fail "c6_clean_tree"

# c7: 変更が docs/design/word-archive/ に限定されている
OUT=$(git -C "$WT" diff --name-only "$BASE"..HEAD | grep -v '^docs/design/word-archive/')
[ -z "$OUT" ] || fail "c7_scope:$OUT"

exit $F
