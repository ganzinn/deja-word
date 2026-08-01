# Android WebView アプリ（APK ビルド・配布）

DejaWord の Android アプリは **ネイティブ WebView シェル**：本番 `https://deja-word.su-dx.com` を Android System WebView がフルスクリーン表示する薄いシェル。TWA と違い Chrome に依存しないため、ファミリーリンクで Chrome を制限しても動作する。採用判断は [ADR-0073](../adr/0073-webview-android-app.md)（TWA 構成の [ADR-0071](../adr/0071-twa-android-app.md) を置換）。

**Web の変更（ページ・機能・スタイル）はリリースだけでアプリに自動反映される。APK の再ビルド・再配布は不要。** 再ビルドが必要になるのは次のときだけ:

- アプリ名・アイコン・テーマ色の変更（`android/app/src/main/res/`）
- 本番ドメインの変更（`MainActivity.kt` の `APP_HOST`）
- **`src/lib/speech.ts` との TTS ブリッジ契約（`DejaWordTts` / `__dejaWordTtsDispatch`）の変更**
- 署名鍵の変更
- targetSdk / 依存ライブラリの更新（Play 公開していない限り急ぐ理由はない）

## 構成

| 場所 | 内容 |
| --- | --- |
| `android/`（Gradle プロジェクト） | Kotlin 単一モジュール。`MainActivity.kt`（WebView シェル）+ `TtsBridge.kt`（ネイティブ TTS）の 2 クラス |
| `android/android.keystore` | 署名鍵。**gitignore 済み・コミット禁止** |
| `public/.well-known/assetlinks.json` | Digital Asset Links。**WebView は参照しない**が、将来の Play 公開・TWA 復帰用に温存（ADR-0073） |
| `~/.bubblewrap/android_sdk` | Android SDK（TWA 時代の導入をそのまま流用。ユーザーローカル、repo 外） |

## 前提環境

- **JDK は `.mise.toml` で pin**（java 21.0.2。mise が `JAVA_HOME` も設定するため手動指定は不要。要件としては Gradle 8.11 が Java 21 対応・AGP 8.9 が JDK 17 以上要求）と Android SDK。Bubblewrap CLI は撤去済みで、**ビルドはコミット済みの `./gradlew` を直接実行**する。SDK の場所は **`android/local.properties`（gitignore 済み・要フルパス）に書く**。clone 直後は存在しないので各自で作成する:

  ```properties
  # android/local.properties
  sdk.dir=/Users/<you>/.bubblewrap/android_sdk
  ```

  （一時的なシェルなら `export ANDROID_HOME=~/.bubblewrap/android_sdk` でも可。未設定なら Gradle が設定方法をエラーで案内する）
- 実機インストールには adb（`~/.bubblewrap/android_sdk/platform-tools/adb`）と、端末側の開発者オプション + USB デバッグ有効化。

## 署名鍵（keystore）の運用

- 鍵: `android/android.keystore`、alias `android`。パスワード（storepass = keypass）は**パスワードマネージャで保管**する（1Password「DejaWord Android keystore」）。作業マシンには置き場所を残さない。
- **バックアップ必須**: keystore ファイル + パスワード + alias の 3 点。鍵が変わると既存端末に上書きインストールできない。
- 紛失時の復旧: `keytool -genkeypair` で新しい鍵を作成 → 各端末で旧アプリをアンインストールして新 APK を入れ直す（assetlinks.json の fingerprint 差し替えは Play / TWA 復帰時のみ関係）。
- fingerprint の確認:

  ```sh
  keytool -list -v -keystore android/android.keystore -alias android | grep SHA256
  ```

## APK のビルド

```sh
scripts/apk-release.sh
```

パスワード取得（1Password CLI → 対話入力の順でフォールバック）〜署名付きビルド〜配布ファイルの場所・インストール方法の表示までを一括で行う。手動で行う場合:

```sh
cd android
DEJAWORD_KEYSTORE_PASSWORD=<pw> ./gradlew assembleRelease
```

- 生成物: `android/app/build/outputs/apk/release/app-release.apk`（署名済み・配布用）。gitignore 済み。
- env を渡さない場合もビルドは通るが **unsigned**（`app-release-unsigned.apk`）になる。配布には署名が必須。
- keypass が storepass と異なる場合のみ `DEJAWORD_KEY_PASSWORD` を追加で渡す。
- **配布し直す（端末で更新インストールする）場合は `android/app/build.gradle.kts` の `versionCode` を +1 する**（`versionName` も合わせる）。
- AAB が必要な場合（Play 移行時）は `./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`。

## 端末へのインストール（サイドロード）

USB 接続で:

```sh
~/.bubblewrap/android_sdk/platform-tools/adb install -r android/app/build/outputs/apk/release/app-release.apk
```

または APK ファイルを端末へ送って（Google Drive / AirDrop 相当）タップでインストール（「提供元不明のアプリ」の許可が必要）。

**ファミリーリンク管理下の子ども端末**では「提供元不明のアプリ」のインストールが既定でブロックされる。保護者側のファミリーリンク設定で許可してからインストールする（インストール後は元に戻してよい。既にインストール済みのアプリは動き続ける）。

## 検証チェックリスト

1. アプリ起動 → スプラッシュ（#18181b）→ サインイン画面またはメニュー表示
2. サインイン → アプリを強制終了 → 再起動してセッション維持（CookieManager.flush）
3. クイズ一連（開始 → 発音自動再生 → 回答 → 正誤効果音 → 結果送信）
4. mp3 音源再生と **ネイティブ TTS フォールバック**（mp3 なし単語で再生ボタンが表示され読み上げられること。クイズ自動読み上げも同様）
5. クイズ中に端末の戻る操作 → 中断確認ダイアログ（`window.confirm`）が表示されること
6. 発音 mp3 のアップロード（単語編集 → ファイル選択ダイアログが開くこと）
7. ダークモード・横向きで表示崩れ・ステータスバー被りがないこと（回転で表示状態が維持されること）
8. **Chrome を無効化した状態で上記が全部動くこと**（本構成の主目的）

トラブルシュート: `adb logcat | grep -iE "dejaword|webview"`。debug ビルド（`./gradlew assembleDebug`）は WebView リモートデバッグ（chrome://inspect）が有効。

## Google Play へ移行する場合のメモ

- `./gradlew bundleRelease` の AAB をアップロードする。**Play App Signing に登録**すると Google 側の署名鍵が配布用になる。TWA ではないため assetlinks.json の追記は必須ではないが、App Links を使う場合は Play Console の「アプリ署名鍵の SHA-256」を追記する。
- applicationId `io.github.ganzinn.dejaword` はそのまま使える（ADR-0071 の命名判断を引き継ぎ）。
