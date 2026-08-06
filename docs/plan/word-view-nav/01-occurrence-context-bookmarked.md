# 01. occurrence-context-bookmarked

状態: **未着手**　PR: （未作成）

## 目的

掲載箇所ビュー由来の単語詳細で、ブックマーク絞り込み（`bookmarked=1`）が前後ナビ・戻りリンクに引き継がれるようにする（現状はコンテキスト型に無く、詳細へ遷移した時点で落ちる）。

スコープ外: コンテキスト型の union 化・`view=word` 判別・単語ビュー由来ナビ（→ 02）。テスト結果ダイアログ（→ 03）。本チケットでは既存の `WordDetailOccurrenceContext` にフィールドを足すだけで、型の再構成はしない。
`docs/features/word-management.md` の改訂も 02 に寄せる（意図的な例外）: 既存記述「絞り込みを保ったまま…移動できます」の「絞り込み」にブックマークも含まれるようになるだけで記述自体は変わらず、ブックマーク保持の明記を含む段落再構成は 02 の担当（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 5）。

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

実装に必要な決定を具体値で再掲する。

- `WordDetailOccurrenceContext` に `bookmarked: boolean` を追加する。パースは一覧と同じ `params.bookmarked === "1"`、クエリ文字列生成は false のとき省略（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 3）
- `findAdjacentWordsByOccurrence` の `AdjacentWordsParams` に `bookmarkedOnly` を追加し、`buildWordsByOccurrenceWhere` へ渡す。where ビルダ自体は一覧用（`word.bookmarks = { some: { userId } }`）に実装済みのため変更不要（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 3）
- 掲載箇所ビューの詳細リンク（`hrefForWord`）と、詳細ページの戻りリンク（`buildWordsHref("occurrence", …)`）にも `bookmarked` を反映する（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 3）
- 閲覧中の単語が絞り込み集合から外れた場合（詳細画面でブックマークを外す等）は、隣接クエリが null を返し前後ナビ非表示。掲載箇所コンテキストの既存挙動と同一で、反映タイミング（サーバ再描画時）も既存に準ずる（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 5）

## 実装内容

### 変更: `src/app/words/_lib/search-params.ts`

- `WordDetailOccurrenceContext` / `RawOccurrenceContextParams` に `bookmarked` を追加（前者は `boolean`、後者は `string | undefined`）
- `parseOccurrenceContext`: `bookmarked: sp.bookmarked === "1"` を追加
- `buildOccurrenceContextQuery`: `bookmarked` が true のときのみ `bookmarked=1` を set（false は省略 — 既存のデフォルト省略規則と同じ）

### 変更: `src/lib/words-list.ts`

- `AdjacentWordsParams` に `bookmarkedOnly?: boolean` を追加
- `findAdjacentWordsByOccurrence` が `buildWordsByOccurrenceWhere` へ `bookmarkedOnly` を渡すようにする（ビルダの引数型が既に持っていれば透過するだけ）
- 同ファイルの「`bookmarkedOnly` は `WordsByOccurrenceParams` のみが渡す（隣接取得の `AdjacentWordsParams` は持たない…）」という趣旨の既存コメントを、本変更後の事実に合わせて更新する

### 変更: `src/app/words/page.tsx`

- `OccurrenceView` の `hrefForWord` で `buildWordDetailHref` に渡すコンテキストへ `bookmarked: bookmarkedOnly` を追加

### 変更: `src/app/words/[id]/page.tsx`

- `findAdjacentWordsByOccurrence` の呼び出しに `bookmarkedOnly: ctx.bookmarked` を追加
- 戻りリンク `buildWordsHref("occurrence", { ...ctx, page: 1 })` は ctx に `bookmarked` が乗ることで自動的に反映される（`buildWordsHref` は `bookmarked` 対応済み）ことを確認する

## 完了条件（Definition of Done）

- [ ] unit（`search-params.unit.test.ts`）: `bookmarked` のパース（`"1"` のみ true、その他・未指定は false）、`buildWordDetailHref` / `buildWordEditHref` が true のとき `bookmarked=1` を含み false のとき省略すること（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4）
- [ ] integration（`words-list.integration.test.ts`）: `findAdjacentWordsByOccurrence` に `bookmarkedOnly` のケースを追加 — ブックマーク済みの単語だけを prev / next が辿ること、current がブックマーク外なら結果が null になること（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` / `pnpm test:integration` が通る
- [ ] 手動確認（e2e-verify スキル）: 掲載箇所ビューで「ブックマークのみ」を ON → 詳細を開く → 前後ナビがブックマーク済みだけを辿る／「一覧へ戻る」で絞り込みが維持される（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4 の「掲載箇所 bookmarked 込みナビ」経路）

## 競合注意

- `src/app/words/_lib/search-params.ts`（＋ `search-params.unit.test.ts`）・`src/app/words/page.tsx`・`src/app/words/[id]/page.tsx`・`src/lib/words-list.ts`（＋ `words-list.integration.test.ts`）: チケット 02 が同じファイルを触る。02 は本チケットのマージ後に着手すること
- `src/lib/words-list.ts` / `words-list.integration.test.ts`: チケット 03 が別関数（`findAdjacentWordsByOccurrenceNumber`）を削除する。並行着手可だが、マージが重なる場合は後の側が rebase で解消する

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
