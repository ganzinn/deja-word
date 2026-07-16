# 08. quiz-result-ui

状態: **実装中**　PR: （未作成）

## 目的

quiz 結果一覧の行と単語詳細ダイアログにブックマークトグルを設置する。結果一覧はクライアント状態駆動のため、結果フェーズ入りで `getBookmarkStates` により一括取得して quiz-flow の状態マップで管理し、行・ダイアログのトグルはコールバックでこのマップへ同期する。

スコープ外: 開始フォーム・プレビュー・drill ラベル（09）、単語一覧・詳細ページ（07）。

## 依存チケット

- 02: `getWordDetailForDialog` の bookmarked 並置に `getBookmarkedWordIdsForUser` を使う
- 06: `BookmarkButton` / `RowBookmarkButton` / `getBookmarkStates` action を使う

## 前提（設計決定の再掲）

- テスト結果一覧の行（result-list.tsx）: 見出し行右端の `ml-auto` 群（削除済みバッジ・RowAudioButton の並び）に `RowBookmarkButton` を追加する。**単語削除済みの行（wordId 参照先なし）には表示しない**（[04-ui.md](../../design/bookmark/04-ui.md) 決定 2）
- ResultRow はクイズ実行中のクライアント状態由来で DB 一覧取得を通らないため、結果フェーズに入った時点で wordId 一覧を渡して `getBookmarkStates` で一括取得し、クライアント側の状態マップ（wordId → boolean）で管理する。行のトグルはこのマップを楽観的更新する。設計はマップの持ち場を「（quiz-flow / ResultList）」としており、本チケットは **quiz-flow で保持し、マップ＋更新コールバックを ResultList へ props で渡す**構成を採る（結果一覧とダイアログが quiz-flow 直下の兄弟であり、両者の同期には共通の親での保持が必要なため）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 4）
- quiz の単語詳細ダイアログ（word-detail-dialog.tsx）: ダイアログのヘッダ部に `BookmarkButton` を置く。出題中（InfoIcon 経由）・結果一覧の行タップ経由のどちらで開いても同じ位置に出る（[04-ui.md](../../design/bookmark/04-ui.md) 決定 2）
- `getWordDetailForDialog` の戻り値に `bookmarked` を並置して返す（表示専用の `WordDetail` 型には混ぜない）。取得は `getBookmarkedWordIdsForUser` を 1 件配列で呼ぶ（[04-ui.md](../../design/bookmark/04-ui.md) 決定 4、[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 4）
- ダイアログ内のトグルは `onBookmarkChange` コールバックで親（結果一覧の状態マップ＝quiz-flow で保持）へ同期する。出題中などマップを持たない呼び出し元ではコールバックなしでも成立する（クイズ中の付け外しは結果フェーズ入りの一括取得が拾うため古くならない）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 4）

## 実装内容

### 変更: `src/app/quiz/_components/quiz-flow.tsx`

- 結果フェーズに入った時点で表示対象 wordId 一覧を渡して `getBookmarkStates` を呼び、状態マップ（wordId → boolean）を quiz-flow の state として保持する
- マップ＋更新コールバックを ResultList へ props で渡す
- WordDetailDialog へ `onBookmarkChange` を渡し、ダイアログ内のトグルをマップへ同期する（出題中に開いたダイアログはマップ未取得でも成立する — クイズ中の付け外しは結果フェーズ入りの一括取得が反映する）
- 触るのはブックマーク配線（状態マップ・ResultList への props・WordDetailDialog への `onBookmarkChange` 受け渡し）の範囲のみ

### 変更: `src/app/quiz/_components/result-list.tsx`

- props で状態マップ＋更新コールバックを受け取る
- 行右端に `RowBookmarkButton`（削除済み行は非表示）。トグルは更新コールバック経由でマップを楽観的更新

### 変更: `src/app/quiz/_components/word-detail-dialog.tsx`

ヘッダに `BookmarkButton`（初期値は `getWordDetailForDialog` の bookmarked）。`onBookmarkChange?` を props に追加（未指定でも成立）。

### 変更: `src/app/quiz/actions.ts`

`getWordDetailForDialog` の戻り値（ok: true 側）に `bookmarked: boolean` を並置する。

## 完了条件（Definition of Done）

- [ ] E2E（e2e-verify スキルの手順）: quiz を 1 回実施 → 結果一覧の行でトグル → 行タップでダイアログを開き状態が一致 → ダイアログ内でトグル → 閉じて行の表示が同期している、の一連。削除済み単語の行にトグルが出ないこと（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` が通る（action 層の専用テストは作らない — [05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5）

## 競合注意

- `src/app/quiz/actions.ts`: 本チケットのみが触る（プレビュー対応は quiz-preview.ts 側 = 03・04 の担当で、この action には及ばない。09 完了時点でも変更不要と確認済み）
- `src/app/quiz/_components/quiz-flow.tsx`: 09（drill ラベル・再テストプレビュー）も触るが、**09 は完了済み（2026-07-16）のため競合しない**。本チケットはブックマーク配線（状態マップ・ResultList への props・WordDetailDialog への `onBookmarkChange` 受け渡し）の範囲で quiz-flow を触ってよい

## 実装メモ

- 2026-07-16 実装セッション: **着手前調査でチケット内の指示が両立不能と判明し、実装せず停止**（worktree 変更なし）。ticket-split への差し戻し対象
  - 矛盾: (1)「状態マップは ResultList 内で管理」(2)「quiz-flow.tsx は 09 の担当・触らない」(3) DoD「ダイアログでトグル → 行の表示が同期」の 3 つが両立しない。結果画面の単語詳細ダイアログを描画しているのは ResultList でなく quiz-flow（quiz-flow.tsx:1054-1060、ResultList は onOpenDialog を dialogStack へ渡すだけ）のため、(3) の配線には quiz-flow の編集が必須で (2) と衝突する
  - 回避不能の確認済み: BookmarkButton は内部 useState で行とダイアログのインスタンスが状態非共有／ResultList とダイアログは quiz-flow 直下の兄弟で context でも包めない／ResultList 自前ダイアログ案はブラウザバックガード（dialogStack 層数）を壊す
  - 推奨解消案（teammate 分析）: 状態マップを quiz-flow に持たせる（設計 04-ui.md 決定 4 の「(quiz-flow / ResultList)」表記とも整合）。その場合 08 が quiz-flow を触るため、**quiz-flow.tsx を共有する 08 と 09 の直列化（順序決め）が必要** → 計画の変更に当たるため ticket-split で判断する
- 2026-07-16 ticket-split 改訂: 上記の推奨解消案を採用し本文へ反映済み（状態マップは quiz-flow で管理、quiz-flow のブックマーク配線は本チケットの担当）。09 は完了済みのため直列化の調整は不要。実装再開可
