# 04. docs-and-adr

状態: **実装中**　PR: （未作成）

## 目的

導線機能のドキュメントを閉じる: ADR-0084 への例外追記、naming-book「検索キーワード正規化」エントリの記述更新、機能紹介 `word-management.md` への導線説明の追記、導線が写るスクリーンショット 1 枚の追加。

スコープ外: 実装・テストの変更は行わない（チケット 01〜03 で完了済み）。

## 依存チケット

- 03: 導線の UI が完成していないとスクリーンショットが撮れない（01〜03 すべてのマージ後に着手する）

## 前提（設計決定の再掲）

- 表示語・プリフィル値は正規化後キーワードで統一する決定は、ADR-0084 の「ユーザーには入力したままの文字列を見せる（正規化するのは DB へ渡す照合値のみ）」という方針に対する**初の例外**であり、ADR-0084 に例外を追記する（[02-ui.md](../../design/word-create-from-search/02-ui.md) 決定 2）
- `docs/reference/naming-book.md` の「検索キーワード正規化（`normalizeSearchKeyword`）」既存エントリも記述更新する（適用箇所の列挙と「検索窓・URL の `q`・件数ラベルは入力されたままを保持する」の注意書きが本機能の例外と矛盾するため。新規用語の追加は無い）（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 3）
- `docs/features/word-management.md` は「単語一覧（単語ビュー）」節に、検索で見つからなかったときの登録導線（発動条件の概要・検索語がプリフィルされること・戻るで検索結果に戻れること）を追記する。「重複登録の警告」節は変更しない（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 5）
- スクリーンショットは、既存ショットの構図（検索語なしの一覧・登録フォーム）に導線が写らなければ再撮影不要とし、導線が表示された検索状態のショットを 1 枚追加する。ショット追加は `scripts/e2e/capture-docs-screenshots.ts` の words セクションに定義を足し、`pnpm e2e:capture-docs --only words` で再生成する（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 5）

## 実装内容

### 変更: `docs/adr/0084-search-keyword-accent-normalization.md`

「正規化後キーワードを画面表示・プリフィルに用いる例外」を追記する（word-create-from-search の導線の表示語と `/words/new` のプリフィル値。大文字小文字は保持しアクセント除去と trim のみが表示に及ぶこと、件数行の表示は従来どおり入力値のままであることを含める）。例外節の追加だけでなく、本機能で古くなる既存記述もあわせて更新する:

- 適用箇所の列挙（「検索キーワードを受け取る 2 モジュールの入口」）に、`src/app/words/page.tsx`（`WordView` の表示語・完全一致判定）と `/words/new` 経路（`src/app/words/new/page.tsx` / `src/app/words/_lib/search-params.ts` のプリフィル導出）の呼び出し口を追加する。列挙の追加に伴い「2 モジュールの入口」という件数表現も実態に合わせて改める
- 「根拠（コード・文書参照）」の参照リストに上記の新規参照元を追加する

### 変更: `docs/reference/naming-book.md`

「検索キーワード正規化（`normalizeSearchKeyword`）」エントリの以下を更新する（新規エントリは追加しない）:

- 定義の「単語一覧（単語ビュー・掲載箇所ビュー・前後ナビ）と「既存単語からリンク」の入口で使う」に、単語ビューの登録導線（表示語・完全一致判定）と `/words/new` のプリフィル導出を加える
- 混同注意の「正規化するのは **DB へ渡す照合値だけ**で、検索窓・URL の `q`・件数ラベルは入力されたままを保持する」に、登録導線の表示語と `/words/new` のプリフィル値は例外として正規化後を表示する旨を追記する（検索窓・URL の `q`・件数ラベルが入力のままである点は変わらない）
- 出典に `src/app/words/page.tsx`・`src/app/words/new/page.tsx`・`src/app/words/_lib/search-params.ts` を追加する（ADR-0084 の適用箇所追加と同じ 3 ファイル。プリフィル導出の実装がどちらのファイルに載ったかに応じて実態に合わせてよい）

### 変更: `docs/features/word-management.md`

「単語一覧（単語ビュー）」節へ前提のとおり追記し、追加ショットを参照する。

### 変更: `scripts/e2e/capture-docs-screenshots.ts`

words セクションに、導線が表示された検索状態のショット定義を 1 枚追加する。検索語は発動条件を満たすもの＝可視範囲（system＋自分）に完全一致 headword が無い語を選ぶこと（既存の被写体 seed と完全一致しない語。部分一致ヒットの有無はどちらでもよい）。

## 完了条件（Definition of Done）

- [ ] `pnpm e2e:capture-docs --only words` でショットが再生成され、追加ショットに導線（＋アイコン付き「「{表示語}」を登録」リンク）が写っていることを目視レビューする（レシピと目視レビューの注意は `docs/features/README.md`。words セクションは `AI_GATEWAY_API_KEY` を設定した環境で流すこと — 未設定だと `word-new.png` が劣化し `word-new-ai-button.png` が warn スキップされる）
- [ ] 既存ショットの構図に導線が写り込んで内容が変わっていないか確認する（写り込む場合は該当ショットも再撮影・差し替え）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
