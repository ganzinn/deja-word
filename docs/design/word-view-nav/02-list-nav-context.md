# 02. 単語一覧 → 詳細ページの URL コンテキスト設計と隣接クエリ

状態: **確定**（2026-08-07）

## 前提（確定事項の再掲）

このトピックが依存する決定。覆す場合はハブ（README.md）と決定元の両方を更新すること。

- 単語ビュー → 詳細ページに前後ナビを新設し、`sort` / `q` / `match` / `bookmarked` を引き継いでその集合・順序の隣へ移動する（01 確定）。
- 掲載箇所コンテキストに `bookmarked` を追加する。他のパラメータ（`occ` / `q` / `match` / `from` / `to` / `order`）は引き継ぎ済み（01 確定）。
- スコープ外: 一覧ソート機能自体の追加・変更、ナビ順序と無関係な既存挙動の変更（01 確定）。

## 検討事項リスト

- [x] 単語ビューコンテキストの URL 設計（→ 決定 1）
- [x] `WordDetailOccurrenceContext` / `parseOccurrenceContext` / `buildWordDetailHref` の一般化（→ 決定 2）
- [x] 掲載箇所コンテキストへの `bookmarked` 追加（→ 決定 3）
- [x] 単語ビュー用の隣接クエリ設計（→ 決定 4）
- [x] 閲覧中に自分が絞り込み集合から外れた場合の挙動（→ 決定 5）
- [x] 「一覧へ戻る」リンクと編集持ち回りの単語ビュー対応（→ 決定 6）

## 議論・決定

### 決定 1: 単語ビューコンテキストは `view=word` を判別子として URL に載せる

単語詳細 URL のコンテキスト判別は次の順で行う:

1. `occ` があれば掲載箇所コンテキスト（既存のまま。`view=word` が同時に付いていても `occ` を優先する）
2. `occ` が無く `view=word` があれば単語ビューコンテキスト
3. どちらも無ければコンテキスト無し（前後ナビ非表示。直リンク・関連語スタック等）

単語ビューコンテキストのパラメータは `view=word`（判別子・常時付与）＋ `sort` / `q` / `match` / `bookmarked`。デフォルト値（`sort=recent` / `match=prefix` / `bookmarked=false` / 空の `q`）は一覧 URL と同じ規則で省略する。単語ビュー一覧の各行リンク（`hrefForWord`）でこのコンテキストを付与する。

例: `/words/<id>?view=word`（既定の新着順一覧由来）、`/words/<id>?view=word&sort=headword&q=re&bookmarked=1`

採用理由: 一覧 URL の既存語彙 `view`（`word` / `occurrence`）を再利用でき、「デフォルト値は URL に含めない」既存方針と両立する（判別子は常時付与、フィルタ系は省略のまま）。2026-08-07 ユーザー選択。
却下した代替案: 専用パラメータ `list=word` の新設（`view` と同義の語彙が 2 つになる）。`sort` 常時付与による判別（デフォルト値 `recent` を URL に載せることになり既存方針と矛盾し、判別子としての意図も読み取りにくい）。

### 決定 2: コンテキスト型は kind 付き discriminated union に一般化する

`src/app/words/_lib/search-params.ts` の型・関数を次の形に一般化する:

```ts
export type WordDetailOccurrenceContext = {
  kind: "occurrence";
  occ: string;
  q?: string;
  match: WordMatchMode;
  from?: string; // 生文字列のまま保持（既存方針を維持）
  to?: string;
  order: OccurrenceNumberOrder;
  bookmarked: boolean; // 決定 3
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

- `parseOccurrenceContext` は `parseWordDetailNavContext(sp): WordDetailNavContext | null` に置き換える（判別順は決定 1。Raw パラメータ型に `view` / `sort` / `bookmarked` を追加する）
- `buildWordDetailHref` / `buildWordEditHref` は union を受け、`kind` で分岐してクエリ文字列を組み立てる（掲載箇所側のクエリ生成・省略規則は既存を維持）

採用理由: 詳細ページ・編集ページ・戻りリンクが「どちらのコンテキストか」を 1 つの値で持ち回れ、分岐が `kind` に集約される。既存呼び出し側（`words/[id]/page.tsx` / `edit/page.tsx`）の変更が最小で済む。
却下した代替案: 既存型へのオプショナルフィールド追加（`occ?` の有無で分岐）: `sort` と `occ`/`from`/`to`/`order` が同居し、成立しない組み合わせを型で排除できない。パーサ・ビルダを 2 系統に分離: 呼び出し側が 2 つの値を持ち回ることになり煩雑。

### 決定 3: 掲載箇所コンテキストに `bookmarked` を追加する

- `WordDetailOccurrenceContext` に `bookmarked: boolean` を追加する。パースは一覧と同じ `bookmarked === "1"`、クエリ生成は false のとき省略
- `findAdjacentWordsByOccurrence` の `AdjacentWordsParams` に `bookmarkedOnly` を追加し、`buildWordsByOccurrenceWhere` へ渡す（where ビルダ自体は一覧用に実装済みのため変更不要）
- 掲載箇所ビューの詳細リンク（`hrefForWord`）と、詳細ページの戻りリンク（`buildWordsHref("occurrence", …)`）にも `bookmarked` を反映する

採用理由: 01 で確定した欠落の補完。where ビルダが一覧と共有されているため、パラメータを 1 つ通すだけで一覧とナビの集合が一致する。
却下した代替案: なし（確定済み要求の実現方法のみ）。

### 決定 4: 単語ビュー用隣接クエリは一覧と where を共有したタプル比較で実装する

`src/lib/words-list.ts` に `findAdjacentWordsInWordView(userId, params)` を新設する。

- `params`: `{ wordId, sort, q?, match, bookmarkedOnly }`
- where は `listWordsForUser` の where 生成をビルダ関数に抽出して共有する（一覧とナビの集合の一致を構造で保証。掲載箇所側の `buildWordsByOccurrenceWhere` と同じパターン）
- current: where AND `{ id: wordId }` で 1 件取得（`createdAt` / `headword` / `id` を select）。**取得できなければ関数全体が null を返す**（集合外 → 決定 5）
- タプル比較は既存の掲載箇所版と同じ OR 展開方式。`createdAt` / `id` は non-null のため null 分岐は不要:
  - `sort=recent`（`createdAt desc, id desc`）: next は `OR [{ createdAt: 同値, id: { lt } }, { createdAt: { lt } }]`、prev はその鏡像（`gt`）。next の orderBy は `[{ createdAt: "desc" }, { id: "desc" }]`、prev は反転 `[{ createdAt: "asc" }, { id: "asc" }]` で各 `findFirst`
  - `sort=headword`（`headword asc, id asc`）: next は `OR [{ headword: 同値, id: { gt } }, { headword: { gt } }]`、prev は鏡像
- 戻り値: `{ prev, next } | null`（`prev` / `next` は隣接単語の id 参照、端なら null）。掲載箇所版と異なり掲載番号は含めない（単語ビューコンテキストでは詳細画面に掲載番号を表示しない。表示の詳細は 04 で扱う）

採用理由: 既存の掲載箇所版と同じ構造（共有 where ＋ OR 展開タプル比較 ＋ findFirst×2）で、実装・テストのパターンを踏襲できる。Prisma に row-value 比較が無い制約下で確立済みの手法。
却下した代替案: 一覧を取得してアプリ側で隣接探索（件数増で劣化し、offset ページングと別系統のクエリ設計を二重に持つ）。Prisma の cursor + take:±1（集合外 current の検出が結局別クエリになり、orderBy との組み合わせ挙動も読みにくく、簡潔にならない）。

### 決定 5: 閲覧中の単語が絞り込み集合から外れたら前後ナビを非表示にする（既存踏襲）

詳細画面でブックマークを外す・見出し語を編集して検索条件から外れる等で current が集合外になった場合、隣接クエリが null を返し、前後ナビを表示しない。戻りリンクはコンテキスト付き一覧のまま維持する。掲載箇所コンテキストの既存挙動と同一で、反映タイミング（サーバ再描画時）も既存に準ずる。

採用理由: 「集合内の隣」が定義できない状態で順序を無理に継続しない、という既存挙動の踏襲。2 コンテキストで挙動が揃う。
却下した代替案: 外れる直前の位置を覚えて継続する（サーバはセッション状態を持たないため直前位置を URL に足すことになり、二重定義かつ陳腐化する）。

### 決定 6: 戻り・編集リンクはコンテキストから再構築し、`page` は持ち回らない

- 戻りリンク: `buildWordsHref(ctx.kind に対応する view, { ...ctx のフィルタ, page: 1 })`。単語ビューで全デフォルトなら `/words` になる
- 編集持ち回り: `buildWordEditHref(id, ctx)`（union 対応、決定 2）。編集ページの戻り先 `buildWordDetailHref(id, ctx)` も同様
- `page` はコンテキストに含めない（掲載箇所コンテキストの既存仕様と同一）

採用理由: 既存の掲載箇所コンテキストの持ち回り方式をそのまま一般化する。`page` は前後ナビで移動するほど実態とずれ、隣接クエリにも不要。
却下した代替案: `page` もコンテキストに載せて戻り位置を復元する（prev/next 遷移のたびに current の所属ページが変わり URL の `page` が実態と食い違う。正しく復元するには単語 id から所属ページを逆算する追加クエリが要り、見合わない）。
