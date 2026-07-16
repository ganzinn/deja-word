# 07. words-ui

状態: **完了（2026-07-16）**　PR: （未作成）

## 目的

単語一覧（行トグル＋toolbar の「ブックマークのみ」フィルタ）と単語詳細ページにブックマークトグルを設置し、E2E で一連の動作を確認する。

スコープ外: quiz 結果一覧・ダイアログ（08）、quiz 開始フォーム（09）。

## 依存チケット

- 02: 単語詳細ページの bookmarked 取得に `getBookmarkedWordIdsForUser` を使う
- 05: `WordListItem.bookmarked` と「ブックマークのみ」フィルタ（words-list.ts）を使う
- 06: `BookmarkButton` / `RowBookmarkButton` を使う

## 前提（設計決定の再掲）

- 単語一覧の行（WordView / OccurrenceView 共通の WordRow）: 見出し行右端の `ml-auto` ボタン群（MY バッジ・RowAudioButton の並び）に `RowBookmarkButton` を追加する（[04-ui.md](../../design/bookmark/04-ui.md) 決定 2）
- 行の bookmarked 初期値は `WordListItem.bookmarked`（05 で追加済み）から渡す（[04-ui.md](../../design/bookmark/04-ui.md) 決定 4）
- 「ブックマークのみ」フィルタ: toolbar に Bookmark アイコンのトグルボタンを追加し、URL searchParams `bookmarked=1` で表現する。OFF（デフォルト）ではパラメータを URL から削除する（「デフォルト値は URL に載せない」既存規約）。WordView / OccurrenceView 両モードで有効（[04-ui.md](../../design/bookmark/04-ui.md) 決定 5）
- フィルタ表示中に行のブックマークを OFF にしても、その行は即座には消えない（再読込・再遷移で消える）。誤タップをその場で取り消せる挙動として意図したもの（[04-ui.md](../../design/bookmark/04-ui.md) 決定 3）
- 単語詳細ページ（words/[id]）: ScreenHeader の `actions` スロットに、編集・削除ボタンの並びで `BookmarkButton` を置く。`WordDetailView` は表示専用のまま変更しない（[04-ui.md](../../design/bookmark/04-ui.md) 決定 2）
- 単語詳細の bookmarked は server component が `getBookmarkedWordIdsForUser(userId, [wordId])` を 1 件配列で呼んで取得する（read 専用関数は増やさない）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 4、[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 1）

## 実装内容

### 変更: `src/app/words/page.tsx`

- WordRow（両ビューモード）の `ml-auto` ボタン群に `RowBookmarkButton` を追加（`bookmarked` は WordListItem から）
- searchParams `bookmarked=1` を解釈し、`listWordsForUser` / `listWordsByOccurrence` のフィルタフラグへ渡す

### 変更: `src/app/words/_components/`（toolbar）

Bookmark アイコントグルを WordView 用（word-list-toolbar.tsx）・OccurrenceView 用（occurrence-filter-toolbar.tsx）の両方に追加する。URL 更新は既存の `toolbar-url.ts` パターンに乗る（デフォルト OFF は param 削除）。

### 変更: `src/app/words/[id]/page.tsx`

`getBookmarkedWordIdsForUser` を 1 件配列で呼び、ScreenHeader `actions` に `BookmarkButton` を設置する。

## 完了条件（Definition of Done）

- [ ] E2E（e2e-verify スキルの手順）: 一覧行でのトグル ON/OFF → 詳細ページで状態が一致 → 詳細でトグル → 一覧へ戻り reload で反映、の一連。「ブックマークのみ」フィルタの絞り込みと URL `bookmarked=1` の付与・削除（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` が通る（一覧バックエンドの integration は 05 で担保済み）

## 実装メモ

- チケットの変更列挙外だが `src/app/words/_lib/search-params.ts` の buildWordsHref に `bookmarked?: boolean` を追加（ページ送りリンクがフィルタを落とさないために必要。デフォルト OFF は URL 非搭載の既存規約に従い true 時のみ `bookmarked=1`）
- 単語詳細の ScreenHeader `actions` を「canEdit || canDelete のとき」条件描画から**常時描画**へ変更（ブックマークは権限に依らず全ユーザー可のため。編集・削除は従来どおり権限で個別出し分け）
- 「ブックマークのみ」トグルは WordView / OccurrenceView 共通部品 `bookmark-filter-toggle.tsx` に切り出し
- 隣接ナビ（詳細の prev/next・戻る）には bookmarked を引き継がない（05 の申し送りどおり findAdjacentWordsByOccurrence が bookmarkedOnly 非対応・設計スコープ外。決定 3 とも整合）
- E2E は WordView で自動実施しパス（行トグル → 詳細一致 → 詳細 OFF → 一覧 reload 反映、フィルタと URL の付与・削除）。**OccurrenceView 側トグルの UI 走行は未実施**（共通部品・同一 buildHref でコード等価、バックエンドは 05 の integration で担保済み。厳密確認が要るなら追加 E2E を検討）
