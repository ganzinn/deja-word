#!/usr/bin/env bash
#
# 署名付き release APK を 1 コマンドでビルドし、配布ファイルの場所と入れ方を表示する。
#
#   Usage: scripts/apk-release.sh
#
# keystore パスワードの解決順:
#   1. 環境変数 DEJAWORD_KEYSTORE_PASSWORD（設定済みならそれを使う）
#   2. 1Password CLI「DejaWord Android keystore」の password（Touch ID 認証が出る）
#   3. 対話プロンプト（op が無い場合のフォールバック）
#
# 前提: Android SDK の場所が android/local.properties（または ANDROID_HOME）で
# 解決できること（docs/ops/android-webview.md）。
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
OP_ITEM="DejaWord Android keystore"
APK="${REPO_ROOT}/android/app/build/outputs/apk/release/app-release.apk"

if [ -z "${DEJAWORD_KEYSTORE_PASSWORD:-}" ]; then
  if command -v op >/dev/null 2>&1; then
    echo "==> 1Password からkeystoreパスワードを取得します（認証を求められたら許可）"
    DEJAWORD_KEYSTORE_PASSWORD="$(op item get "$OP_ITEM" --fields password --reveal)"
  elif [ -t 0 ]; then
    read -r -s -p "keystore password: " DEJAWORD_KEYSTORE_PASSWORD
    echo
  else
    echo "error: DEJAWORD_KEYSTORE_PASSWORD が未設定で、op も対話入力も使えません" >&2
    exit 1
  fi
fi
export DEJAWORD_KEYSTORE_PASSWORD

echo "==> Building signed release APK"
(cd "${REPO_ROOT}/android" && ./gradlew assembleRelease)

if [ ! -f "$APK" ]; then
  echo "error: 署名済み APK が見つかりません（unsigned になっていないか確認）: $APK" >&2
  exit 1
fi

VERSION_LINE="$(grep -E 'versionCode|versionName' "${REPO_ROOT}/android/app/build.gradle.kts" | tr -d ' ' | paste -sd' ' -)"

cat <<EOF

==> ビルド完了（${VERSION_LINE}）

配布ファイル（端末に入れるのはこの 1 ファイル）:

  ${APK}

インストール方法（どちらか）:
  - USB 接続:  ~/.bubblewrap/android_sdk/platform-tools/adb install -r "${APK}"
  - ファイル転送: 上記 APK を Google Drive 等で端末へ送り、タップしてインストール

※ 端末で「更新」として認識させるには versionCode が前回配布より大きいこと
   （android/app/build.gradle.kts。上げ忘れていたら +1 して再実行）
EOF
