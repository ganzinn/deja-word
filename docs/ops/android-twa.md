# Android TWA（APK ビルド・配布）

DejaWord の Android アプリは **TWA (Trusted Web Activity)**：本番 `https://deja-word.su-dx.com` を端末の Chrome がフルスクリーン表示する薄いシェル。採用判断は [ADR-0071](../adr/0071-twa-android-app.md)。

**Web の変更（ページ・機能・スタイル）はリリースだけでアプリに自動反映される。APK の再ビルド・再配布は不要。** 再ビルドが必要になるのは次のときだけ:

- アプリ名・アイコン・テーマ色・start_url など manifest 由来設定の変更（`src/app/manifest.ts` を変えたら `bubblewrap update` で追従）
- 本番ドメインの変更
- 署名鍵の変更
- Bubblewrap / targetSdk の更新（Play 公開していない限り急ぐ理由はない）

## 構成

| 場所 | 内容 |
| --- | --- |
| `android/twa-manifest.json` | TWA 設定の真実源（コミット対象） |
| `android/`（Gradle プロジェクト） | `bubblewrap update` が twa-manifest.json から生成（コミット対象） |
| `android/android.keystore` | 署名鍵。**gitignore 済み・コミット禁止** |
| `public/.well-known/assetlinks.json` | Digital Asset Links。署名鍵の SHA-256 fingerprint を宣言し、Chrome が検証して URL バーを消す（サイドロードでも機能する） |
| `~/.bubblewrap/` | JDK / Android SDK / CLI 設定（ユーザーローカル、repo 外） |

## 前提環境

- `@bubblewrap/cli` は devDependency 固定。**必ず `pnpm exec bubblewrap <cmd>` で実行**（グローバル導入しない）。
- JDK 17 と Android SDK が必要。`pnpm exec bubblewrap doctor` が通ればよい。別マシンで初めてビルドする場合は対話プロンプトに従って `~/.bubblewrap/` 配下へ自動ダウンロードさせるのが簡単（初回セットアップ時は macOS 既存の JDK 17 + 手動配置した command line tools を `~/.bubblewrap/config.json` に指定した）。
- 実機インストールには adb（`~/.bubblewrap/android_sdk/platform-tools/adb`）と、端末側の開発者オプション + USB デバッグ有効化。

## 署名鍵（keystore）の運用

- 鍵: `android/android.keystore`、alias `android`。パスワード（storepass = keypass）は**パスワードマネージャで保管**する。作業マシンには置き場所を残さない。
- **バックアップ必須**: keystore ファイル + パスワード + alias の 3 点。鍵が変わると既存端末に上書きインストールできない。
- 紛失時の復旧: `keytool -genkeypair` で新しい鍵を作成 → 新 fingerprint で `public/.well-known/assetlinks.json` を差し替え → リリース（本番反映）→ 各端末で旧アプリをアンインストールして新 APK を入れ直す。
- fingerprint の確認:

  ```sh
  keytool -list -v -keystore android/android.keystore -alias android | grep SHA256
  ```

## APK のビルド

```sh
cd android
BUBBLEWRAP_KEYSTORE_PASSWORD=<pw> BUBBLEWRAP_KEY_PASSWORD=<pw> \
  pnpm exec bubblewrap build --skipPwaValidation
```

- 生成物: `android/app-release-signed.apk`（配布用）と `app-release-bundle.aab`（Play 移行時用）。いずれも gitignore 済み。
- `--skipPwaValidation` は Lighthouse の PWA 検査（Service Worker 必須等）をスキップする。オフライン非対応の方針（ADR-0071）のため常用してよい。
- env を渡さなければパスワードは対話プロンプトで聞かれる（そちらでも可）。
- manifest 由来設定を変えた場合は先に `pnpm exec bubblewrap update --skipVersionUpgrade` でプロジェクトを再生成する。**配布し直す（端末で更新インストールする）場合は versionCode を上げる必要がある**ため、`--skipVersionUpgrade` を外すか `twa-manifest.json` の `appVersionCode` / `appVersionName` を上げてから build する。

## 端末へのインストール（サイドロード）

USB 接続で:

```sh
~/.bubblewrap/android_sdk/platform-tools/adb install -r android/app-release-signed.apk
```

または APK ファイルを端末へ送って（Google Drive / AirDrop 相当）タップでインストール（「提供元不明のアプリ」の許可が必要）。

## 検証チェックリスト

1. `curl https://deja-word.su-dx.com/.well-known/assetlinks.json` — 200 / fingerprint が keystore と一致
2. アプリ起動 → スプラッシュ（#18181b）→ **URL バーが表示されない**（= Asset Links 検証成功。URL バーが出る場合は assetlinks 未反映か fingerprint 不一致。`adb logcat | grep -i origin` と Google の Statement List Tester で切り分け）
3. サインイン → アプリを強制終了 → 再起動してセッション維持（cookie）
4. クイズ一連（開始 → 回答 → 結果送信）
5. mp3 音源再生と TTS フォールバック（mp3 なし単語）
6. ダークモード・横向きで表示崩れ・ステータスバー被りがないこと

## Google Play へ移行する場合のメモ

- `app-release-bundle.aab` をアップロードする。**Play App Signing に登録**すると Google 側の署名鍵が配布用になるため、Play Console に表示される「アプリ署名鍵の SHA-256」を `assetlinks.json` の `sha256_cert_fingerprints` 配列に**追記**（既存のサイドロード用 fingerprint は残す）してリリースする。
- applicationId `io.github.ganzinn.dejaword` はそのまま使える（ADR-0071 の命名判断）。
