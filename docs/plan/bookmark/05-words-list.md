# 05. words-list

状態: **実装中**　PR: （未作成）

## 目的

単語一覧のバックエンド（`src/lib/words-list.ts`）に `bookmarked` 列と「ブックマークのみ」フィルタを追加する。UI（行ボタン・toolbar トグル）は 07 が担う。

スコープ外: 一覧ページ・toolbar の UI 変更（07）、ブックマークの書き込み（02・06）。

## 依存チケット

- 01: `bookmarks` リレーション（Bookmark テーブル）を select / where で使う

## 前提（設計決定の再掲）

- `WordListItem` / `WordOccurrenceListItem` に `bookmarked: boolean` を追加する。`wordListSelect` に閲覧ユーザー userId でスコープした Bookmark の存在確認 select を足し、`toWordListItem` で boolean に整形する（取得関数は userId を既に受けている）（[04-ui.md](../../design/bookmark/04-ui.md) 決定 4）
- select の具体形は `bookmarks: { where: { userId }, take: 1 }` を追加して boolean へ畳む（`occurrences-list.ts` の `isPreset` と同型）（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 4）
- 「ブックマークのみ」フィルタは `listWordsForUser` / `listWordsByOccurrence` の where へ `bookmarks: { some: { userId } }` を追加する。WordView / OccurrenceView 両モードで有効（[04-ui.md](../../design/bookmark/04-ui.md) 決定 5、[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 4）
- クエリ性能: 述語・フィルタ・join はすべて userId を先頭に持つ Bookmark PK で引ける。追加 index は不要（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 4）

## 実装内容

### 変更: `src/lib/words-list.ts`

- `wordListSelect` を userId を受ける形にし（関数化 or 呼び出し箇所での合成は実装裁量）、`bookmarks: { where: { userId }, take: 1 }` を追加
- `WordListItem` / `WordOccurrenceListItem` に `bookmarked: boolean` を追加し、`toWordListItem` で整形
- `WordListParams`（および掲載箇所別一覧の引数）に「ブックマークのみ」フィルタのフラグを追加し、`listWordsForUser` / `listWordsByOccurrence` の where へ `bookmarks: { some: { userId } }` を条件付きで追加

### 変更: `src/lib/words-list.integration.test.ts`（拡張）

## 完了条件（Definition of Done）

- [ ] integration: `bookmarked` フラグの真偽（自分のブックマークだけが true）・「ブックマークのみ」フィルタの絞り込み・他ユーザーのブックマークが混ざらない分離（[05-architecture.md](../../design/bookmark/05-architecture.md) 決定 5）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:integration` が通る

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
