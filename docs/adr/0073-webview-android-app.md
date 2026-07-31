# ADR-0073: Android 提供は WebView シェル + ネイティブ TTS ブリッジ

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-31

## 背景

Android 提供は TWA + APK サイドロード（[ADR-0071](0071-twa-android-app.md)）としてきたが、運用で前提が崩れた。TWA は端末の Chrome がレンダリングを担うため、**ファミリーリンクで Chrome に利用制限をかけると DejaWord も使用不能になる**。子ども端末で「ブラウザは制限しつつ DejaWord は許可する」という管理ができない。

一方、Android 10 以降の WebView（Android System WebView）は Trichrome 構成で Chrome と別アプリになっており、Chrome を無効化・制限しても独立して動作する（Chromium 公式 FAQ）。WebView ベースのシェルにすれば、ファミリーリンク上も DejaWord が独立アプリとして表示され、個別に利用制限を設定できる。

WebView 化の技術的障害は 2 点あり、いずれも解決可能と確認した:

- ADR-0071 が WebView ラッパー案を却下した理由は「Capacitor 等ではオリジンが `capacitor://localhost` になり cookie 認証・CSRF の再設計が必要」だったが、**本番 URL `https://deja-word.su-dx.com` を直接ロードする素の WebView にはこの問題は当たらない**（cookie はファーストパーティのまま、Server Action の same-origin CSRF 検査も通る）。認証は email/password のみで、WebView を拒否する外部 OAuth も無い。
- Android WebView は `window.speechSynthesis` 非対応（crbug 40468168 / 40417848。Chrome と異なり長年未実装）。TTS フォールバック（[ADR-0046](0046-tts-fallback.md)）が成立しないため、ネイティブ TextToSpeech への橋渡しが必要。

## 決定内容

**ネイティブ WebView シェル + ネイティブ TTS ブリッジ**を採用し、ADR-0071 の TWA 構成を置き換える。

- **`android/` は Kotlin 単一モジュール**（`MainActivity.kt` + `TtsBridge.kt` の 2 クラス、依存は androidx のみ）。Bubblewrap 生成物と `@bubblewrap/cli` devDependency は撤去する。
- **applicationId `io.github.ganzinn.dejaword`・署名鍵は TWA 版から継続**し、versionCode を上げて既存端末に上書きインストールできるようにする（鍵運用は [docs/ops/android-webview.md](../ops/android-webview.md)）。
- **minSdk 29（Android 10）**。WebView が Chrome から独立している（Trichrome）ことが本構成の前提であり、Chrome が WebView 実装を兼ねる Android 7–9 では「Chrome 制限下でも動く」が保証できないため。
- **署名は Gradle の signingConfigs + 環境変数**（`DEJAWORD_KEYSTORE_PASSWORD`）に移し、`./gradlew assembleRelease` で署名済み APK を直接出す（Bubblewrap の外部署名を廃止）。
- **TTS ブリッジ**: `addJavascriptInterface` で `window.DejaWordTts`（`speak`/`cancel`/`isAvailable`）を注入し、`src/lib/speech.ts` が speechSynthesis より優先して使う。イベントは `window.__dejaWordTtsDispatch(id, "start"|"end"|"error", detail)` で返し、**意図的中断は "end" に正規化**して speech.ts のエラー契約（cancel では onError を呼ばない）をネイティブ側で保証する。speech.ts の公開 API・呼び出し側 8 ファイルは無変更で、ブリッジ不在のブラウザでは完全に従来動作。
- WebView 設定はサイトの挙動要件から決める: 自動再生許可（[ADR-0047](0047-quiz-audio-autoplay-preload.md)）、CookieManager flush（セッション永続化 [ADR-0004](0004-better-auth-two-stage-session-check.md)）、`onShowFileChooser`（発音 mp3 アップロード）、既定 JS ダイアログ（クイズ中断の `window.confirm`）、戻る操作の `webView.goBack()` 委譲（クイズの popstate バックガード）。
- **`public/.well-known/assetlinks.json` は温存する**。WebView は Digital Asset Links を参照しないが、将来の Play 公開・TWA 復帰の選択肢を保つため（静的ファイル 1 枚で害が無い）。

## 採らなかった代替案

- **TWA 継続 + ファミリーリンク側の運用回避** — Chrome の時間制限・ブロックを外すことは「ブラウザは制限したい」という管理要件そのものと矛盾する。TWA のまま解決する手段は無い。
- **Capacitor** — 別オリジン問題の回避（server.url 設定で本番 URL を指す）は可能だが、素の WebView 2 クラスで足りる要件にフレームワーク一式は過剰。TTS ブリッジは結局自前実装になる。
- **TTS を諦める（mp3 未登録単語は無音）** — 既存ガードにより壊れはしないが、TTS フォールバックを正式機能とした ADR-0046 の決定に反する。ブリッジの実装量（ネイティブ 1 クラス + speech.ts の分岐）に対し得られる同等性が大きい。
- **minSdk 21 維持** — Android 7–9 では WebView の Chrome 独立性が無く本 ADR の動機を満たせない。対象端末（家族の現行端末）に Android 9 以下は無い。

## 影響

- ADR-0071 は廃止（本 ADR が置換）。**「Web の変更はリリースだけでアプリに自動反映される」特性は維持**される（シェルは URL を指すだけ）。アプリ再ビルドが必要になるのは、アプリ名・アイコン・テーマ色・ドメイン・署名鍵・targetSdk に加え、**speech.ts とのブリッジ契約（`DejaWordTts` / `__dejaWordTtsDispatch`）を変えたとき**。
- ADR-0046 が保留していた「Android Chrome で TTS 無音」問題は、アプリ内ではネイティブ TTS 経由になるため影響しなくなる（ブラウザ利用時は従来どおり）。
- `beforeunload` によるクイズ離脱警告は WebView では発火しない。戻る操作経路は confirm ガードで守られており許容する。
- レンダリングエンジンが「端末の Chrome」から「端末の Android System WebView」に変わる。機能差は speechSynthesis（ブリッジで解決）以外に本アプリへの影響なしと調査済みだが、以後のブラウザ API 採用時は WebView 対応の確認が必要。
- サイドロード運用・Play 移行オプション（AAB 生成・assetlinks 追記）は ADR-0071 から引き継ぐ。

## 根拠（設計・コード・文書参照）

- `android/app/src/main/kotlin/io/github/ganzinn/dejaword/`（MainActivity / TtsBridge）
- `src/lib/speech.ts`（ブリッジ優先の分岐とイベント受け口）
- `docs/ops/android-webview.md`（ビルド・署名・配布・検証手順）
- [ADR-0071](0071-twa-android-app.md)（置換元。WebView 却下理由が本構成に当たらないことは本文参照）
- [ADR-0004](0004-better-auth-two-stage-session-check.md) / [ADR-0046](0046-tts-fallback.md) / [ADR-0047](0047-quiz-audio-autoplay-preload.md)（シェル要件の由来）
- Chromium WebView FAQ（Trichrome / Chrome 無効化時の独立動作）、crbug 40468168・40417848（speechSynthesis 非対応）
