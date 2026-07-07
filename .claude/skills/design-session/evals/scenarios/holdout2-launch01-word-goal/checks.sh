#!/usr/bin/env bash
# holdout2-launch01-word-goal 機械判定（封印 2026-07-08）
# 新規立ち上げ → そのまま 01（要求）を確定して終了処理まで、のモード遷移を検証する
# usage: checks.sh <worktree> <base_sha>   exit 0 = pass
set -u
WT=$1
BASE=$2
DIR="$WT/docs/design/word-goal"
HUB="$DIR/README.md"
T01="$DIR/01-requirements.md"
F=0
fail() { echo "FAIL $1"; F=1; }

# c1: ハブと 01 が存在する
if [ ! -f "$HUB" ] || [ ! -f "$T01" ]; then
  fail "c1_files_exist"
  exit 1
fi

# c2: ハブに必須セクションがある
for sec in '## 目的・スコープ' '## 確定事項サマリ' '## トピック状態表' '## セッション運用ルール'; do
  grep -q "$sec" "$HUB" || fail "c2_hub_section:$sec"
done

# c3: トピック状態表に 5 行以上のトピック行があり、リンクとファイルが相互一致する
ROWS=$(grep -Ec '\[0[0-9]-[a-z0-9-]+\.md\]' "$HUB")
[ "$ROWS" -ge 5 ] || fail "c3_topic_rows:${ROWS}<5"
for f in "$DIR"/0*.md; do
  [ -e "$f" ] || continue
  b=$(basename "$f")
  grep -q "$b" "$HUB" || fail "c3_hub_missing_link:$b"
done
for n in $(grep -oE '0[0-9]-[a-z0-9-]+\.md' "$HUB" | sort -u); do
  [ -f "$DIR/$n" ] || fail "c3_file_missing:$n"
done

# c4: 01 が統一形式の日付付きで確定し、決定が「決定 N:」見出し・採用理由・却下案付きで記録されている
grep -q '状態: \*\*確定\*\*' "$T01" || fail "c4_state_fixed"
grep -q '2026-' "$T01" || fail "c4_state_date"
N=$(grep -Ec '^#{2,4} 決定 [0-9]+:' "$T01")
[ "$N" -ge 2 ] || fail "c4_decision_headings:${N}<2"
DECISIONS=$(awk '/^##+ 決定 [0-9]+:/{f=1} f{print}' "$T01")
echo "$DECISIONS" | grep -q '採用' || fail "c4_adoption_reason"
echo "$DECISIONS" | grep -q '却下' || fail "c4_rejected_alternative"

# c5: ハブ状態表の 01 行が確定、01 以外のトピックは未着手のまま
grep -E '01-[a-z0-9-]+\.md\)' "$HUB" | grep -q '確定' || fail "c5_hub_row_01_fixed"
for f in "$DIR"/0*.md; do
  [ -e "$f" ] || continue
  b=$(basename "$f")
  case "$b" in 01-*) continue ;; esac
  grep -q '状態: \*\*未着手\*\*' "$f" || fail "c5_state_untouched:$b"
done

# c6: ハブ確定事項サマリに 01 の結論が昇格している
awk '/^## 確定事項サマリ/,/^## トピック状態表/' "$HUB" | grep -qE '01-[a-z0-9-]+\.md' || fail "c6_hub_summary_promoted"

# c7: 01 の決定が後続トピック（02）の前提に統一形式で再掲されている
T02=$(ls "$DIR"/02-*.md 2>/dev/null | head -1)
if [ -n "$T02" ]; then
  awk '/^## 前提/,/^## 検討事項リスト/' "$T02" | grep -q '01 確定' || fail "c7_premise_relisted_in_02"
else
  fail "c7_no_topic_02"
fi

# c8: 次セッションの推奨トピックが 02 に更新されている
grep -q '次セッションの推奨トピック: 02' "$HUB" || fail "c8_next_topic_02"

# c9: コミットが存在し、メッセージが「word-goal 設計: 」で始まる
git -C "$WT" log --format=%s "$BASE"..HEAD | grep -Eq '^word-goal 設計: ' || fail "c9_commit_subject"

# c10: 作業ツリーがクリーン
[ -z "$(git -C "$WT" status --porcelain)" ] || fail "c10_clean_tree"

# c11: 変更が docs/design/word-goal/ に限定されている
OUT=$(git -C "$WT" diff --name-only "$BASE"..HEAD | grep -v '^docs/design/word-goal/')
[ -z "$OUT" ] || fail "c11_scope:$OUT"

exit $F
