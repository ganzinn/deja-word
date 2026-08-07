# ADR-0089: 単語詳細の前後ナビを一覧コンテキストに追随させる（`view=word` URL コンテキスト）

- ステータス: 提案
- 確信度: 高
- 起票日: 2026-08-07

## 背景

単語詳細ページの前後ナビは掲載箇所ビュー由来（`occ` 付き URL）でしか出ず、単語ビュー（新着順 / 見出し語順の単語一覧）から詳細を開くと、一覧の並び・絞り込みがあってもナビが無かった。また掲載箇所コンテキストにはブックマーク絞り込み（`bookmarked=1`）が含まれず、詳細へ遷移した時点で絞り込みが落ちていた。

word-view-nav 設計（`docs/design/word-view-nav/02-list-nav-context.md`。実装完了に伴い削除予定のため、決定を本 ADR に転記する）で、単語ビュー由来の詳細にも「直前に見ていた一覧の並び・絞り込み」に追随する前後ナビを出すことを確定した。

## 決定内容

1. **単語ビューコンテキストは `view=word` を判別子として URL に載せる**: 詳細 URL のコンテキスト判別は (1) `occ` があれば掲載箇所コンテキスト（`view=word` が同時に付いていても `occ` 優先）、(2) `occ` が無く `view=word` があれば単語ビューコンテキスト、(3) どちらも無ければコンテキスト無し（前後ナビ非表示。直リンク・関連語スタック等）の順。パラメータは `view=word`（常時付与）＋ `sort` / `q` / `match` / `bookmarked` で、デフォルト値（`sort=recent` / `match=prefix` / `bookmarked=false` / 空の `q`）は一覧 URL と同じ規則で省略する。例: `/words/<id>?view=word`、`/words/<id>?view=word&sort=headword&q=re&bookmarked=1`。
2. **コンテキスト型は kind 付き discriminated union に一般化する**: `WordDetailOccurrenceContext`（`kind: "occurrence"`）と `WordDetailWordViewContext`（`kind: "word"`）の union `WordDetailNavContext` とし、`parseOccurrenceContext` は `parseWordDetailNavContext(sp): WordDetailNavContext | null` に置き換える。`buildWordDetailHref` / `buildWordEditHref` は union を受けて `kind` で分岐する（掲載箇所側のクエリ生成・省略規則は既存を維持）。
3. **掲載箇所コンテキストに `bookmarked` を追加する**: パースは一覧と同じ `bookmarked === "1"`、クエリ生成は false のとき省略。`findAdjacentWordsByOccurrence` の `AdjacentWordsParams` に `bookmarkedOnly` を追加して共有 where ビルダへ渡し、掲載箇所ビューの詳細リンクと詳細ページの戻りリンクにも反映する。
4. **単語ビュー用隣接クエリは一覧と where を共有したタプル比較で実装する**: `src/lib/words-list.ts` に `findAdjacentWordsInWordView(userId, { wordId, sort, q?, match, bookmarkedOnly })` を新設。where は `listWordsForUser` の where 生成をビルダ関数に抽出して共有する（一覧とナビの集合の一致を構造で保証）。current は where AND `{ id: wordId }` で 1 件取得し、取得できなければ関数全体が null（集合外 = ナビ非表示）。隣接は既存の掲載箇所版と同じ OR 展開のタプル比較 ＋ `findFirst` × 2（`sort=recent` は `createdAt desc, id desc`、`sort=headword` は `headword asc, id asc`。`createdAt` / `id` は non-null のため null 分岐は不要）。戻り値は `{ prev, next } | null` で掲載番号は含めない（単語ビューコンテキストでは詳細画面に `#N` を表示しない）。
5. **閲覧中の単語が絞り込み集合から外れたら前後ナビを非表示にする（既存踏襲）**: 詳細画面でブックマークを外す・見出し語編集で検索条件から外れる等では隣接クエリが null を返しナビを出さない。戻りリンクはコンテキスト付き一覧のまま維持し、反映タイミング（サーバ再描画時）も既存に準ずる。
6. **戻り・編集リンクはコンテキストから再構築し、`page` は持ち回らない**: 戻りリンクは `buildWordsHref(ctx.kind に対応する view, { ...ctx のフィルタ, page: 1 })`（単語ビューで全デフォルトなら `/words`）。編集持ち回りは `buildWordEditHref(id, ctx)`、編集ページの戻り先は `buildWordDetailHref(id, ctx)`。`page` はコンテキストに含めない（掲載箇所コンテキストの既存仕様と同一）。

## 採らなかった代替案

- **判別子に専用パラメータ `list=word` を新設** — 一覧 URL の既存語彙 `view`（`word` / `occurrence`）と同義の語彙が 2 つになる。
- **`sort` 常時付与による判別** — デフォルト値 `recent` を URL に載せることになり「デフォルト値は URL に含めない」既存方針と矛盾し、判別子としての意図も読み取りにくい。
- **既存コンテキスト型へのオプショナルフィールド追加（`occ?` の有無で分岐）** — `sort` と `occ` / `from` / `to` / `order` が同居し、成立しない組み合わせを型で排除できない。
- **パーサ・ビルダを 2 系統に分離** — 呼び出し側が 2 つの値を持ち回ることになり煩雑。
- **隣接探索を一覧取得＋アプリ側で実施** — 件数増で劣化し、offset ページングと別系統のクエリ設計を二重に持つ。
- **Prisma の cursor + take:±1** — 集合外 current の検出が結局別クエリになり、orderBy との組み合わせ挙動も読みにくく、簡潔にならない。
- **集合から外れる直前の位置を覚えてナビを継続** — サーバはセッション状態を持たないため直前位置を URL に足すことになり、二重定義かつ陳腐化する。
- **`page` もコンテキストに載せて戻り位置を復元** — prev / next 遷移のたびに current の所属ページが変わり URL の `page` が実態と食い違う。正しく復元するには単語 id から所属ページを逆算する追加クエリが要り、見合わない。

## 影響

- 単語ビューから開いた詳細でも、一覧の並び（新着順 / 見出し語順）・検索・ブックマーク絞り込みに追随する前後ナビと「一覧へ戻る」が使える（従来はナビ無し）。
- 掲載箇所ビュー由来のナビ・戻りリンクでもブックマーク絞り込みが保持される（従来は詳細遷移で消失）。
- `#N`（掲載番号）は掲載箇所ビュー由来のときだけ表示される。
- 詳細・編集ページの searchParams 解釈が union コンテキストに一本化され、由来ビューの追加は `kind` の追加で拡張できる。

## 根拠（コード・文書参照）

- `docs/design/word-view-nav/02-list-nav-context.md` 決定 1〜6（実装完了に伴い削除予定 → 本 ADR が長期の引き継ぎ先）
- `src/app/words/_lib/search-params.ts`（union 型・`parseWordDetailNavContext`・kind 分岐の href ビルダ）
- `src/lib/words-list.ts`（`buildWordListWhere` の共有・`findAdjacentWordsInWordView`）
- ADR-0087（`#N` は見出し語右に表示。単語ビュー由来では非表示とする本決定の表示先）
- ADR-0088（テスト結果ダイアログ側の前後ナビ。本 ADR の詳細ページナビとは独立）
