# ADR-0071: Android 提供は TWA + APK サイドロード

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-07-25

## 背景

DejaWord の全機能を Android アプリとして提供したい。要件は「Web 版の機能をそのまま」であり、ネイティブ固有機能（プッシュ通知・オフライン動作・カメラ等）の追加要件はない。配布対象は自分・知人（少人数）で、Google Play 公開は当面行わない。

本アプリは cookie ベースの Better Auth セッション（[ADR-0004](0004-better-auth-two-stage-session-check.md)）・同一オリジン前提の auth client・`<audio>` / SpeechSynthesis による音源再生（[ADR-0046](0046-tts-fallback.md) / [ADR-0047](0047-quiz-audio-autoplay-preload.md)）を持ち、これらがモバイルシェルの選択に制約を与える。

## 決定内容

**TWA (Trusted Web Activity)** を採用する。本番サイト `https://deja-word.vercel.app` を端末の Chrome がフルスクリーン表示する薄いネイティブシェルを Bubblewrap で生成し、署名済み APK を直接配布（サイドロード）する。

- **Android プロジェクトは repo 内 `android/`** に置く。`android/twa-manifest.json` が TWA 設定の真実源で、Bubblewrap が生成する Gradle プロジェクト一式もコミットする（`bubblewrap update` で再生成可能だが、差分レビューできる状態を保つ）。署名鍵（`android/*.keystore`）とビルド生成物（`*.apk` / `*.aab` / `build/`）は gitignore で除外し、**鍵は git 管理しない**。
- **applicationId は `io.github.ganzinn.dejaword`**。`vercel.app` は public suffix であり逆ドメイン命名（`app.vercel.deja_word` 等）だと Play 移行時に所有証明できないため、GitHub アカウント由来の `io.github.<user>` 慣行を使う。
- **Digital Asset Links は `public/.well-known/assetlinks.json` の静的配信**。署名鍵の SHA-256 fingerprint を宣言し、Chrome が起動時に検証して URL バーを非表示化する。検証は Play ストア経由ではなく端末上の Chrome が行うため、**サイドロードでも機能する**。`src/proxy.ts` の matcher は `/menu|/words|/quiz|/settings` のみで `/.well-known/*` は認証リダイレクトに掛からない。Play 移行時は Play App Signing の fingerprint を同 JSON の配列に追記すればよく、静的ファイルのままで足りる。
- **`@bubblewrap/cli` は devDependency に固定**し `pnpm exec bubblewrap` で使う（Vercel CLI と同じ流儀。グローバル導入しない）。JDK / Android SDK はユーザーローカル（`~/.bubblewrap/`）で repo 外。
- **Service Worker によるオフライン対応はやらない**。クイズ・単語管理は DB 必須でオフラインの意味が薄く、manifest のみの「インストール可能」状態で TWA 要件は満たす。

## 採らなかった代替案

- **Capacitor / ネイティブ WebView ラッパー** — WebView のオリジンが `capacitor://localhost` 等の別オリジンになり、cookie ベース認証・CSRF・`baseURL`/trustedOrigins の再設計が必要。SpeechSynthesis も WebView では不安定。「そのまま提供」の要件に対し改修コストが大きく却下。TWA は Chrome 本体のレンダリングなので、cookie セッション維持・TTS・音源再生が Web 版と同一挙動になる。
- **React Native 等での再実装** — 全機能の二重実装・二重保守。論外。
- **PWA インストール案内のみ（アプリ配布なし）** — Chrome メニューからのホーム画面追加でも近い体験は得られるが、「アプリとして配る」要件（ランチャーアイコン・ストア風の導入体験）を満たさないため、TWA の APK を作る。なお TWA は PWA 整備の上位互換であり、この案は自動的に内包される。
- **Google Play 公開** — 開発者登録・審査・プライバシーポリシー整備のコストに対し、現時点の配布対象は少人数。将来必要になれば本構成（applicationId 命名・AAB 生成済み・assetlinks 追記可能）のまま移行できるため今はやらない。

## 影響

- Web 側の変更は本番リリースだけでアプリに自動反映される（シェルは URL を指すだけ）。**アプリ再ビルド・再配布が必要になるのは manifest 由来設定（アプリ名・アイコン・テーマ色・start_url）・本番ドメイン・署名鍵・targetSdk の変更時のみ**。手順は `docs/ops/android-twa.md`。
- 署名鍵を紛失すると既存端末への上書きインストールができなくなる（再署名 → assetlinks 差し替え → 各端末で入れ直し）。鍵とパスワードのバックアップが運用上の必須事項（同 ops ドキュメント）。
- `src/app/layout.tsx` に `viewport.themeColor` を追加（ステータスバー色）。safe-area / `viewportFit: "cover"` は standalone TWA でステータスバー被りが出ないため見送り。Bubblewrap テンプレートが将来 edge-to-edge を既定化した場合に再検討する。

## 根拠（設計・コード・文書参照）

- `android/twa-manifest.json`（TWA 設定の真実源）
- `public/.well-known/assetlinks.json`（Digital Asset Links）
- `docs/ops/android-twa.md`（ビルド・配布・鍵運用手順）
- [ADR-0004](0004-better-auth-two-stage-session-check.md) / [ADR-0046](0046-tts-fallback.md) / [ADR-0047](0047-quiz-audio-autoplay-preload.md)（シェル選択の制約となった既存決定）
