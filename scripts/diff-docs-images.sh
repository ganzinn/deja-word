#!/usr/bin/env bash
#
# 機能紹介ドキュメントのスクリーンショット差分を 1 コマンドで確認する。
#
#   Usage: pnpm docs:diff-images [path...]
#
#   引数なし: docs/features/images/ 配下の変更画像（tracked の変更＋untracked）を HEAD と比較
#   引数あり: 指定パスだけを比較
#
# 出力: 状態 / 寸法（旧 -> 新）/ 差分ピクセル数（ImageMagick の AE メトリクス）/ md5。
# ImageMagick（magick）が無い環境では md5 とファイルサイズのみ出す。
#
# 存在理由: 再撮影後の目視レビュー（docs/features/README.md）で毎回同じ比較をするが、
# `for n in ...; do magick compare ...; $(magick identify ...); done` のワンライナーは
# コマンド置換・未許可コマンドで承認プロンプトになる（issue #244）。ここに寄せる。
set -euo pipefail

IMAGE_DIR="docs/features/images"

have() { command -v "$1" >/dev/null 2>&1; }

if have magick; then
  HAVE_MAGICK=1
else
  HAVE_MAGICK=0
  echo "warn: magick (ImageMagick) が無いため寸法・差分ピクセルはスキップします" >&2
fi

md5of() {
  if have md5; then
    md5 -q "$1"
  elif have md5sum; then
    md5sum "$1" | cut -d' ' -f1
  else
    echo "-"
  fi
}

short() { cut -c1-8; }

TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT

collect() {
  if [ "$#" -gt 0 ]; then
    printf '%s\n' "$@"
  else
    {
      git diff --name-only HEAD -- "$IMAGE_DIR"
      git ls-files --others --exclude-standard -- "$IMAGE_DIR"
    } | sort -u
  fi
}

TARGETS="$(collect "$@")"
if [ -z "$TARGETS" ]; then
  echo "diff-docs-images: ${IMAGE_DIR} に変更画像はありません"
  exit 0
fi

printf '%-52s %-8s %-24s %-22s %s\n' FILE STATUS "DIMENSIONS (old -> new)" "DIFF PIXELS (AE)" "MD5 (old -> new)"

while IFS= read -r path; do
  [ -n "$path" ] || continue

  if [ ! -f "$path" ]; then
    printf '%-52s %-8s %-24s %-22s %s\n' "$path" deleted - - -
    continue
  fi

  new_md5="$(md5of "$path" | short)"
  old="${TMPDIR_WORK}/old.$(basename "$path")"

  if git show "HEAD:${path}" >"$old" 2>/dev/null; then
    status=changed
    old_md5="$(md5of "$old" | short)"
    # md5 が取れない環境では同一判定をしない（差分なしと誤読させないため）
    if [ "$new_md5" != "-" ] && [ "$old_md5" = "$new_md5" ]; then
      status=same
    fi
  else
    status=new
    old=""
    old_md5="-"
  fi

  dims="-"
  diffpx="-"
  if [ "$HAVE_MAGICK" = 1 ]; then
    new_dims="$(magick identify -format '%wx%h' "$path" 2>/dev/null || echo '?')"
    if [ -n "$old" ]; then
      old_dims="$(magick identify -format '%wx%h' "$old" 2>/dev/null || echo '?')"
      dims="${old_dims} -> ${new_dims}"
      if [ "$old_dims" = "$new_dims" ]; then
        # 出力は build により "5041"（Q16）か "3.3e+08 (5041)"（HDRI: 括弧内が実ピクセル数）
        raw="$(magick compare -metric AE "$old" "$path" null: 2>&1 || true)"
        case "$raw" in
          *\(*\)*)
            ae="${raw##*\(}"
            ae="${ae%%\)*}"
            ;;
          *) ae="${raw%% *}" ;;
        esac
        total="$(magick identify -format '%[fx:w*h]' "$path" 2>/dev/null || echo 0)"
        case "$ae" in
          "" | *[!0-9.eE+-]*) diffpx="compare failed" ;;
          *) diffpx="$(awk -v a="$ae" -v t="$total" 'BEGIN{if(t>0)printf "%d (%.2f%%)", a, a*100/t; else printf "%d", a}')" ;;
        esac
      else
        diffpx="size changed"
      fi
    else
      dims="- -> ${new_dims}"
    fi
  else
    diffpx="$(wc -c <"$path" | tr -d ' ') bytes"
  fi

  printf '%-52s %-8s %-24s %-22s %s\n' "$path" "$status" "$dims" "$diffpx" "${old_md5} -> ${new_md5}"
done <<EOF
$TARGETS
EOF

echo
echo "画像は公開して問題ない内容か目視で確認すること（docs/features/README.md）。"
