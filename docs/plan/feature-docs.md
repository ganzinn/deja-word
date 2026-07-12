# 機能紹介ドキュメント（docs/features/）整備プラン

リポジトリ公開に向けて、機能ごとの紹介ページ（スクリーンショット付き）を `docs/features/` に整備する。
将来的にアプリ内ヘルプページへ転用できる「機能ごとの大枠」を作ることが目的。

コンテキスト肥大を避けるためセッションを分割して進める。**本ファイルが進行状況の単一の真実源**。
各チケット完了時に該当セクションを消し込み、全チケット完了時に本ファイルを削除する
（docs/design/ と同じライフサイクル運用）。

## 共通事項（全チケット）

### 撮影環境

- 通常のローカル dev（`docker compose up -d` → `pnpm dev`、localhost:3000）と既存 DB を使う。
- 撮影スクリプトは `scripts/e2e/capture-docs-screenshots.ts`（`pnpm e2e:capture-docs [--only <section>]`）。
  セクション単位で追記していき、部分実行で既存画像を再撮影せずに済むようにする。
- 一般ユーザーは `test1@example.com`（`ensureUser` で冪等用意）、admin 画面は system ユーザー
  （`assertSystemUserReady` で preflight、1 ユーザー 1 context 規約で別 context）。
- 出力は `docs/features/images/<name>.png`。viewport 1280x800 / **deviceScaleFactor 2**（文字の鮮明化）/
  colorScheme "light" / reducedMotion "reduce" 固定。ページ全体ではなく、`shot()` に
  コンテンツコンテナの Locator を渡して **bounding box ＋余白でクリップ**する
  （余白だらけの画像を避ける。縦方向は子要素の実範囲を採るため flex-1 の伸びは写らない）。
- 撮影内容はローカル DB の登録データに依存する（ターゲット1900 の**部分的な**写り込みは許容、
  一式がわかる形での掲載は不可）。commit 前に目視レビューする
  （写り込み範囲・ダークモード/トースト混入なし）。
- 被写体の headword 等はスクリプト定数で固定し、DB に無ければ明示エラーにする。
- 被写体データが既存 DB に無い場合（例: 意味・例文・関連語・メモが揃った語が無かった②）は、
  `scripts/e2e/db.ts` に冪等な seed ヘルパを足して撮影前に用意する（②の `ensureDemoWord` が手本。
  自作の非著作コンテンツにする）。test1 は使い回しなので seed した被写体は残ってよい。
- ビューポート（800px）より高いページ（詳細・編集など）は `shot()` が一時的にビューポートを
  伸ばして全体を撮る（クリップは viewport 内しか撮れないため）。縦長の被写体でも欠けない。

### ドキュメント共通フォーマット

- 各ページ: `## 概要` / `## 主な画面と操作`（H3 ごとに画像 1 枚＋2〜4 文）/ `## 補足`。
- 用語は `docs/reference/naming-book.md` 準拠（単語テスト・定着〔「卒業」禁止〕・ラウンド・
  掲載箇所〔「出典」禁止〕・うろ覚え・メニュー・訳語・同意語/反意語/派生語 など）。
- 記載後に整合性セルフレビュー（用語・相対リンク・画像参照の突合）を行う。
- `docs/features/README.md` の目次には全機能が並んでいる。ページを執筆したら「準備中」を
  リンクに置き換える。

## チケット④: 設定＋管理

- capture スクリプトに `settings` セクション（4 枚: settings-home / settings-general /
  settings-occurrences / settings-quiz-defaults）と `admin` セクション（1 枚: admin-users、
  **system ログイン・別 context**）を追加。
- `docs/features/settings.md` を執筆。章立て: 全般（発音音源未登録時の TTS 代替）/
  掲載箇所の管理とプリセット / 単語テストのデフォルト設定（形式別制限時間含む）。
- `docs/features/admin.md` を執筆。章立て: ユーザー管理（`/admin/users`・招待 → 本人パスワード設定
  `/set-password`）。補足: 管理者 = system ユーザー・共有マスタの所有者。
  `docs/ops/admin-user-invite.md` へリンク。
- 完了条件: 画像 5 枚＋2 ページ執筆＋README 目次リンク化＋目視レビュー。
