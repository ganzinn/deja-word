# 03. feature-docs

状態: **完了（2026-08-08）**　PR: （未作成）

## 目的

一括ブックマーク機能の機能紹介ドキュメントを更新し、一括ボタンが写る新規画像を 1 枚追加撮影する。

スコープ外: 機能の実装（チケット 01・02）。既存画像（`bookmark-quiz-result.png` / `bookmark-quiz-result-dialog.png` / `quiz-result.png`）の再撮影はしない。

## 依存チケット

- 02: 撮影対象の一括ボタン UI が動作していること

## 前提（設計決定の再掲）

- `docs/features/bookmark.md` の「テスト結果からの付け外し」節に、一括ブックマーク（「間違えた問題だけ表示」ON で件数入りボタン）の説明を追記する。既存 `bookmark-quiz-result.png` / `bookmark-quiz-result-dialog.png` と対応本文（ON/OFF 混在の行一覧・詳細ダイアログ）は現状のまま維持する（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 5）
- 新規画像は `bookmark-quiz-result-bulk.png`（チェック ON・一括ボタンが写る画）を 1 枚追加する（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 5）
- 撮影スクリプト `scripts/e2e/capture-docs-screenshots.ts` の `sectionBookmark` への追加は以下のみ（現行はダイアログ撮影で終わるため、閉じる操作から始める。セクション末尾への追加のため既存 2 枚の撮影に影響なし）（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 5）:
  1. 開いたままの単語詳細ダイアログを閉じる
  2. 「間違えた問題だけ表示」チェックを ON にする
  3. 一括ボタンの可視待ち
  4. `bookmark-quiz-result-bulk.png` を撮影
- 回答手順の変更は不要（現行の自己判定回答 3 問完走で誤答が既に 2 件できる）（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 5）
- 再撮影コマンド: `pnpm e2e:capture-docs --only bookmark`（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 5）
- `docs/features/word-quiz.md` の「テスト結果」節に、一括ブックマークできる旨の 1 文と bookmark.md へのリンクを追加する。`quiz-result.png` はチェック OFF の画のため再撮影不要（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 5）

## 実装内容

### 変更: `docs/features/bookmark.md`

「テスト結果からの付け外し」節に一括ブックマークの説明（チェック ON で件数入りボタンが出る・押下でまとめて登録・解除は行トグルで個別に）を追記し、新規画像 `bookmark-quiz-result-bulk.png` を掲載する。

### 変更: `docs/features/word-quiz.md`

「テスト結果」節に一括ブックマークできる旨の 1 文＋ bookmark.md へのリンクを追加する。

### 変更: `scripts/e2e/capture-docs-screenshots.ts`

`sectionBookmark` のセクション末尾に前提の手順 1〜4 を追加する。

### 作成: `docs/features/images/bookmark-quiz-result-bulk.png`

`pnpm e2e:capture-docs --only bookmark` で生成する（画像の置き場・命名は撮影スクリプトの既存出力に従う）。実行前提（dev サーバ起動・seed 済みローカル DB・system パスワード設定・test1 ユーザー）と手順は `docs/features/README.md` の再生成レシピに従う。

## 完了条件（Definition of Done）

- [ ] `pnpm e2e:capture-docs --only bookmark` が完走し、新規画像が生成される・既存 2 枚に意図しない差分が出ない
- [ ] 生成画像の目視レビュー（`docs/features/README.md` の注意に従う。チェック ON・件数入り一括ボタンが写っていること）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

## 実装メモ

実装内容は計画どおり（bookmark.md / word-quiz.md / 撮影スクリプト / 新規画像の 4 点、スコープ外の再撮影なし）。

- **撮影スクリプトの手順詳細**: ダイアログを閉じる操作は shadcn Dialog の閉じるボタン（アクセシブル名 `Close`）のクリック＋ `hidden` 待ち。一括ボタンは履歴送信の成功前 disabled のため、`main.locator("button:not([disabled])", { hasText: "語をまとめてブックマーク" })` を `shot()` の ready ロケータにして「押せる状態」を待ってから撮影している（テキストが件数入りで可変のため name 完全一致は使えない）。
- **既存画像のドリフトを検出**（本チケットとは無関係の既存問題。コミットには含めず撮影前の状態へ戻した）: `bookmark-quiz-result-dialog.png` が 2026-08-04 撮影のままで、その後の UI 変更（掲載番号の位置・発音ボタンのアイコン化）が未反映。issue #245 として起票済み。`bookmark-quiz-start.png` / `bookmark-words-list.png` の差分はノイズ・微差、`bookmark-quiz-result.png` は出題順ランダムによる行順変化のみで、いずれも意味のある変更なし。
