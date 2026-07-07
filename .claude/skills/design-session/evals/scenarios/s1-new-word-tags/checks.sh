#!/usr/bin/env bash
# s1-new-word-tags 機械判定（凍結 2026-07-08）
# usage: checks.sh <worktree> <base_sha>   exit 0 = pass
set -u
WT=$1
BASE=$2
DIR="$WT/docs/design/word-tags"
HUB="$DIR/README.md"
F=0
fail() { echo "FAIL $1"; F=1; }

# c1: ハブが存在する
if [ ! -f "$HUB" ]; then
  fail "c1_hub_exists"
  exit 1
fi

# c2: ハブに必須セクションがある
for sec in '## 目的・スコープ' '## 確定事項サマリ' '## トピック状態表' '## セッション運用ルール'; do
  grep -q "$sec" "$HUB" || fail "c2_hub_section:$sec"
done

# c3: トピック状態表に 5 行以上のトピック行がある（標準形 01〜05）
ROWS=$(grep -Ec '\[0[0-9]-[a-z0-9-]+\.md\]' "$HUB")
[ "$ROWS" -ge 5 ] || fail "c3_topic_rows:${ROWS}<5"

# c4: 状態表のリンクとディスク上のトピックファイルが相互に一致する
for f in "$DIR"/0*.md; do
  [ -e "$f" ] || continue
  b=$(basename "$f")
  grep -q "$b" "$HUB" || fail "c4_hub_missing_link:$b"
done
for n in $(grep -oE '0[0-9]-[a-z0-9-]+\.md' "$HUB" | sort -u); do
  [ -f "$DIR/$n" ] || fail "c4_file_missing:$n"
done

# c5: 各トピックファイルが雛形の必須セクションと未着手状態を持つ
for f in "$DIR"/0*.md; do
  [ -e "$f" ] || { fail "c5_no_topic_files"; break; }
  b=$(basename "$f")
  grep -q '## 前提' "$f" || fail "c5_section_premise:$b"
  grep -q '## 検討事項リスト' "$f" || fail "c5_section_agenda:$b"
  grep -q '## 議論・決定' "$f" || fail "c5_section_decisions:$b"
  grep -q '状態: \*\*未着手\*\*' "$f" || fail "c5_state_untouched:$b"
done

# c6: 次セッションの推奨トピックが 01
grep -q '次セッションの推奨トピック: 01' "$HUB" || fail "c6_next_topic_01"

# c7: 立ち上げコミットが存在する（メッセージは「word-tags 設計: 」で始まる）
git -C "$WT" log --format=%s "$BASE"..HEAD | grep -Eq '^word-tags 設計: ' || fail "c7_commit_subject"

# c8: 作業ツリーがクリーン（やり残しがない）
[ -z "$(git -C "$WT" status --porcelain)" ] || fail "c8_clean_tree"

# c9: 変更が docs/design/word-tags/ に限定されている
OUT=$(git -C "$WT" diff --name-only "$BASE"..HEAD | grep -v '^docs/design/word-tags/')
[ -z "$OUT" ] || fail "c9_scope:$OUT"

exit $F
