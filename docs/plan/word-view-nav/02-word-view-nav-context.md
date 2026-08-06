# 02. word-view-nav-context

状態: **未着手**　PR: （未作成）

## 目的

単語ビュー由来の単語詳細ページに、一覧の並び（新着順 / 見出し順）・検索・ブックマーク絞り込みを引き継いだ前後ナビを新設する。コンテキスト型を kind 付き union に一般化し、単語ビュー用の隣接クエリを追加してページに配線する。ユーザー向けドキュメント・ADR・naming-book の更新も本 PR に含む。

スコープ外: 掲載箇所コンテキストの `bookmarked` 追加（→ 01 で実施済みの前提）。テスト結果ダイアログ（→ 03）。一覧ソート機能自体の追加・変更、関連語スタック先のナビ非表示の解除（設計スコープ外）。

## 依存チケット

- 01: `WordDetailOccurrenceContext.bookmarked` と `AdjacentWordsParams.bookmarkedOnly` が追加済みであること（本チケットの union 化はそのフィールドを含む型を再構成する）

## 前提（設計決定の再掲）

実装に必要な決定を具体値で再掲する。

- 詳細 URL のコンテキスト判別順: (1) `occ` があれば掲載箇所コンテキスト（`view=word` が同時に付いていても `occ` 優先）、(2) `occ` が無く `view=word` があれば単語ビューコンテキスト、(3) どちらも無ければコンテキスト無し = 前後ナビ非表示（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 1）
- 単語ビューコンテキストのパラメータは `view=word`（判別子・常時付与）＋ `sort` / `q` / `match` / `bookmarked`。デフォルト値（`sort=recent` / `match=prefix` / `bookmarked=false` / 空の `q`）は一覧 URL と同じ規則で省略する。例: `/words/<id>?view=word`、`/words/<id>?view=word&sort=headword&q=re&bookmarked=1`（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 1）
- コンテキスト型の具体形（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 2）:

  ```ts
  export type WordDetailOccurrenceContext = {
    kind: "occurrence";
    occ: string;
    q?: string;
    match: WordMatchMode;
    from?: string; // 生文字列のまま保持（既存方針を維持）
    to?: string;
    order: OccurrenceNumberOrder;
    bookmarked: boolean;
  };

  export type WordDetailWordViewContext = {
    kind: "word";
    sort: WordListSort; // "recent" | "headword"
    q?: string;
    match: WordMatchMode;
    bookmarked: boolean;
  };

  export type WordDetailNavContext =
    | WordDetailOccurrenceContext
    | WordDetailWordViewContext;
  ```

- `parseOccurrenceContext` は `parseWordDetailNavContext(sp): WordDetailNavContext | null` に置き換える。Raw パラメータ型に `view` / `sort` / `bookmarked` を追加。`buildWordDetailHref` / `buildWordEditHref` は union を受けて `kind` で分岐（掲載箇所側のクエリ生成・省略規則は既存を維持）（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 2）
- 単語ビュー用隣接クエリ `findAdjacentWordsInWordView(userId, params)` を `src/lib/words-list.ts` に新設。`params` は `{ wordId, sort, q?, match, bookmarkedOnly }`。where は `listWordsForUser` の where 生成をビルダ関数に抽出して共有する。current は where AND `{ id: wordId }` で 1 件取得（`createdAt` / `headword` / `id` を select）し、取得できなければ関数全体が null（集合外 = ナビ非表示）（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 4）
- タプル比較は既存の掲載箇所版と同じ OR 展開方式。`createdAt` / `id` は non-null のため null 分岐は不要（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 4）:
  - `sort=recent`（`createdAt desc, id desc`）: next は `OR [{ createdAt: 同値, id: { lt } }, { createdAt: { lt } }]`、prev はその鏡像（`gt`）。next の orderBy は `[{ createdAt: "desc" }, { id: "desc" }]`、prev は反転 `[{ createdAt: "asc" }, { id: "asc" }]` で各 `findFirst`
  - `sort=headword`（`headword asc, id asc`）: next は `OR [{ headword: 同値, id: { gt } }, { headword: { gt } }]`、prev は鏡像
- 戻り値は `{ prev, next } | null`（prev / next は隣接単語の id 参照、端なら null）。掲載番号は含めない。単語ビューコンテキストでは詳細画面に掲載番号 `#N` を表示しない（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 4）
- 戻りリンクは `buildWordsHref(ctx.kind に対応する view, { ...ctx のフィルタ, page: 1 })`（単語ビューで全デフォルトなら `/words`）。編集持ち回りは `buildWordEditHref(id, ctx)`、編集ページの戻り先は `buildWordDetailHref(id, ctx)`。`page` はコンテキストに含めない（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) 決定 6）
- ページ側ナビ UI は既存の `WordNavArea` / `AdjacentWordNav` / `WordContentTransition` を流用し、新規 UI は作らない。`words/[id]/page.tsx` は `ctx.kind` で隣接クエリを出し分け、ナビ表示条件を「ctx 非 null かつ隣接結果非 null」に一般化する（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 1）
- `docs/features/word-management.md` の該当段落（「掲載箇所ビューから開いた詳細では」）を再構成: 前後ナビは単語ビュー・掲載箇所ビューの両由来で使える説明にし、`#N` は掲載箇所ビュー由来のみ・ブックマーク絞り込みも保たれることを明記。スクリーンショットの再撮影・追加はしない（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 5）
- ADR ①「単語詳細の前後ナビを一覧コンテキストに追随させる（`view=word` URL コンテキスト）」を起票する（02 の決定を採用理由・却下案ごと転記。番号は起票時点の最新 + 1）。naming-book §1-9 に「前後ナビ」「単語ビュー / 掲載箇所ビュー」のエントリを追加する（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 6）

## 実装内容

### 変更: `src/app/words/_lib/search-params.ts`

- 前提のコード形どおり union 化（既存 `WordDetailOccurrenceContext` に `kind: "occurrence"` を追加、`WordDetailWordViewContext` / `WordDetailNavContext` を新設）
- `parseOccurrenceContext` → `parseWordDetailNavContext` に改名・置き換え（判別順は前提のとおり。既存の `occ` 系正規化ロジックは維持し、word 側は `sort`（`"headword"` 以外は `"recent"`）・`match`・`bookmarked`・trim 済み `q` をパース）
- `buildWordDetailHref` / `buildWordEditHref`: union を受け、`kind: "word"` のとき `view=word` を常時 set ＋デフォルト省略でクエリ生成。`kind: "occurrence"` は既存の生成を維持

### 変更: `src/lib/words-list.ts`

- `listWordsForUser` の where 生成をビルダ関数（例: `buildWordListWhere(userId, params)`）に抽出し、一覧とナビで共有
- `findAdjacentWordsInWordView` を前提のシグネチャ・タプル比較で新設。prev / next を `Promise.all` の `findFirst` × 2 で取得（掲載箇所版 `findAdjacentWordsByOccurrence` と同じ構造）

### 変更: `src/app/words/page.tsx`

- `WordView` の行リンクを `buildWordDetailHref(wordId, { kind: "word", sort, q, match, bookmarked: bookmarkedOnly })` に変更（現状はコンテキスト無しの `/words/<id>`）

### 変更: `src/app/words/[id]/page.tsx`

- `parseWordDetailNavContext` への置き換え。`ctx.kind` で分岐:
  - `"occurrence"`: 既存どおり `findAdjacentWordsByOccurrence` ＋ `#N`（`nav.current.occurrenceNumber`）
  - `"word"`: `findAdjacentWordsInWordView` を呼び、`#N` は渡さない（null）
- 戻りリンク: `buildWordsHref(ctx.kind === "word" ? "word" : "occurrence", { ...ctx のフィルタ, page: 1 })`
- `WordNavArea` への `currentHref` / `prevHref` / `nextHref` は両 kind とも `buildWordDetailHref` で生成（コンポーネント側は無改造）

### 変更: `src/app/words/[id]/edit/page.tsx`

- `parseWordDetailNavContext` への置き換え（union ctx をそのまま `buildWordDetailHref(id, ctx)` の戻り先に使う）

### 変更: `docs/features/word-management.md`

- 前提のとおり該当段落を再構成（ナビは両ビュー由来・`#N` は掲載箇所ビュー由来のみ・ブックマーク絞り込み保持）

### 作成: `docs/adr/00XX-word-detail-nav-list-context.md`（番号は起票時点の最新 + 1、スラッグは目安）

- ADR ① を起票（[02-list-nav-context.md](../../design/word-view-nav/02-list-nav-context.md) の決定 1〜6 を転記）。`docs/adr/README.md` の一覧にも追記

### 変更: `docs/reference/naming-book.md`

- §1-9 に「前後ナビ」（英語名: `AdjacentWordNav` / adjacent word nav。詳細ページとテスト結果ダイアログの 2 箇所、順序はコンテキスト由来）、「単語ビュー / 掲載箇所ビュー」（英語名: `view=word` / `view=occurrence`。一覧の 2 表示モードで、詳細 URL のコンテキスト判別子にも使う）を追加

## 完了条件（Definition of Done）

- [ ] unit（`search-params.unit.test.ts`）: 判別順（`occ` 優先 → `view=word` → null）、単語ビューコンテキストのパースと正規化（`sort` / `bookmarked` / `q` trim）、href 生成のデフォルト省略（`view=word` は常時付与・`sort=recent` 等は省略）。既存の occ 系ケースは新パーサのケースとして引き継ぐ（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4）
- [ ] integration（`words-list.integration.test.ts`）: `findAdjacentWordsInWordView` の describe を新設 — recent / headword 両順の prev / next と端、**`createdAt` 同値時の id tiebreak（同値データを明示的に作る）**、`q` / `match` 絞り込み、`bookmarkedOnly`、集合外 current は null、scope（own + system 混在・他ユーザー除外）（[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` / `pnpm test:integration` が通る
- [ ] 手動確認（e2e-verify スキル、[04-ui-architecture.md](../../design/word-view-nav/04-ui-architecture.md) 決定 4 の「単語ビュー由来ページナビ」経路）: 単語ビューで検索・ソート・ブックマーク絞り込みを設定 → 詳細を開くと前後ナビが一覧の並びどおりに移動する／`#N` が表示されない／「一覧へ戻る」で絞り込みが維持される／既存の掲載箇所由来ナビ・直リンク（ナビ非表示）が退行していない
- [ ] `docs/features/word-management.md`・ADR ①・naming-book の更新が同 PR に含まれている

## 競合注意

- `src/app/words/_lib/search-params.ts`（＋ `search-params.unit.test.ts`）・`src/app/words/page.tsx`・`src/app/words/[id]/page.tsx`・`src/lib/words-list.ts`（＋ `words-list.integration.test.ts`）: チケット 01 と共有。**01 のマージ後に着手すること**
- `src/lib/words-list.ts` / `words-list.integration.test.ts`: チケット 03 が別関数（`findAdjacentWordsByOccurrenceNumber`）を削除する。マージが重なる場合は後の側が rebase で解消する
- `docs/adr/README.md`: チケット 03（ADR ②）も一覧表へ行を追記する。後からマージする側が rebase で番号・行順を揃える

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
