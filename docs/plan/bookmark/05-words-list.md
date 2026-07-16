# 05. words-list

状態: **完了（2026-07-16）**　PR: （未作成）

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

- select の bookmarks に `select: { userId: true }` を付与（チケット再掲の literal は `{ where: { userId }, take: 1 }` だが、参照元 isPreset パターンに合わせ取得列を絞った。挙動は同じ）
- `buildWordsByOccurrenceWhere` に `bookmarkedOnly` を optional で追加。`AdjacentWordsParams` は同フラグを持たないため**隣接取得（prev/next ナビ）は従来どおり無フィルタ**（設計決定 5 の対象が listWordsForUser / listWordsByOccurrence の 2 関数のみのため意図的にスコープ外）。→ **07（words-ui）でトグル ON 時に単語詳細の隣接ナビも絞り込ませたい場合は、findAdjacentWordsByOccurrence への bookmarkedOnly 追加が別途必要**（ヘルパは受け入れ可能済み、AdjacentWordsParams への追加＋呼び出し配線のみ）。判断が要れば ticket-split へ
- q と bookmarkedOnly の同時指定で `word` キーが二重定義にならないよう、両条件を単一 `Prisma.WordWhereInput` に畳んでから spread
