# 02. new-page-prefill

状態: **実装中**　PR: （未作成）

## 目的

登録フォーム `/words/new` に「検索語プリフィル＋戻り先」の受け口を追加する。searchParams から headword のプリフィル値と一覧への戻り先 URL（returnHref）をサーバ側で導出・再構築し、導線リンク `/words/new?<一覧コンテキスト>` の URL 生成ヘルパ（チケット 03 が使用）と `parsePage` の `search-params.ts` への移設もあわせて行う。

スコープ外: 導線リンクの表示（`WordView` の並列取得・件数行直下のリンク）はチケット 03。ADR-0084 への例外追記はチケット 04。未ログインで `/words/new` を開いたときのサインインリダイレクト（現状 `redirect("/sign-in?redirect=/words/new")` の固定文字列）は変更せず、この経路での一覧コンテキストの引き回しは行わない（サインイン後のプリフィル・戻り先は失われてよい。受け口の追加以外は変更しないスコープに従う）。

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- 導線リンクは `/words/new?<一覧コンテキスト>` で、一覧コンテキストは単語ビューの検索条件 `q` / `sort` / `match` / `bookmarked` / `page` をそのまま渡したもの。`q` は URL・件数行と同じ **trim 済み入力値**。プリフィル専用パラメータ（`headword=` 等）は設けず、生の戻り先 URL（`return=/words?...` のような値）も受けない（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 2）
- プリフィル: `q` に `normalizeSearchKeyword` を適用した値が `headwordSchema`（trim・1〜100 文字）の safeParse に通った場合のみ `defaultValues.headword` に設定する。通らなければプリフィルなし（従来どおり空）。safeParse は手打ち URL 等への防御（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 2）
- プリフィル値は正規化後キーワードで、正規化はアクセント記号の除去と trim のみ。**大文字小文字は保持する**（「RUN」で検索すればプリフィルも「RUN」。完全一致判定が大文字小文字を区別しないことと混同して小文字化しない）（[02-ui.md](../../design/word-create-from-search/02-ui.md) 決定 2）
- 戻り先: 検索コンテキストの有無は「`q` の trim 後が非空か」で判別する（既存の `(params.q ?? "").trim()` 流儀。`view` 等の判別子は追加しない）。`q` が非空なら `q` / `sort` / `match` / `bookmarked` / `page` をパースし、`buildWordsHref("word", ...)` で一覧 URL を再構築して `WordForm` の `returnHref` に渡す。`q` が無ければ `returnHref` を渡さない（従来どおり `/words`）。パースは `search-params.ts` の既存パーサを再利用し、不足分は同ファイルへ追加する。不正値は既存流儀どおりデフォルトへフォールバックする（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 2）
- `word-form.tsx` は create モードの `backHref` を `returnHref ?? "/words"` に変更する（現状は edit のみ `returnHref` を使用）。送信成功時の遷移は変更しない（`isEdit && returnHref` ガードのまま、登録成功後は既存どおり単語詳細へ）（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 2、[02-ui.md](../../design/word-create-from-search/02-ui.md) 決定 4・5）
- プリフィルされた headword に対するフォーム初期表示時の重複チェックは行わない。既存の blur 発火はそのまま残す（[02-ui.md](../../design/word-create-from-search/02-ui.md) 決定 3）
- 登録フォームの項目・入力仕様、重複警告（headword-exists）の照合仕様（自分の単語のみ・大文字小文字を区別する完全一致）は変更しない（[01-requirements.md](../../design/word-create-from-search/01-requirements.md) 決定 3）

## 実装内容

### 変更: `src/app/words/_lib/search-params.ts`（＋ `search-params.unit.test.ts`）

- `src/app/words/page.tsx` ローカルの `parsePage` を本ファイルへ移設する（page.tsx は import に差し替え）
- 一覧コンテキスト（`q` / `sort` / `match` / `bookmarked` / `page`）のパースと `buildWordsHref("word", ...)` による一覧 URL 再構築に必要なヘルパを、既存パーサ（`parseMatch` 等）を再利用しつつ追加する。`sort` のパーサは既存 export に無いため新設する（`page.tsx` 内のインライン判定 `params.sort === "headword" ? ... : "recent"` は本チケットでは触らず残す。page.tsx への変更は `parsePage` の import 差し替えのみ）。`buildWordsHref` は `page: number` が必須引数のため、returnHref 再構築時は `parsePage` の結果を必ず渡す
- **導線リンク `/words/new?<一覧コンテキスト>` の URL 生成ヘルパ**（例: `buildNewWordHref(ctx)`）も本ファイルに追加する。省略規則は既存 `buildWordsHref` と揃える（デフォルト値・1 ページ目の `page` は省略、`bookmarked` は `1` 表記）。チケット 03 はこのヘルパを呼ぶだけにし、URL 契約（生成⇔パース）を本ファイル＋unit テストの 1 箇所に閉じる
- プリフィル導出（`q` → `normalizeSearchKeyword` → `headwordSchema` の safeParse）・returnHref 再構築を純関数に切り出せる場合は本ファイルに同居させ、unit テストでカバーする（一覧 URL・検索語と関心が同じため。同ファイルの unit テスト前例に倣う）。`headwordSchema` の所在は `src/lib/schema/word-form.ts`、`normalizeSearchKeyword` は `src/lib/search-keyword.ts`

### 変更: `src/app/words/new/page.tsx`

- searchParams を受ける口を追加する（現状 props 無し）
- プリフィル: 前提のとおり導出し、通った場合のみ `defaultValues.headword` に設定する
- 戻り先: `q` の trim 後が非空なら一覧 URL を再構築して `WordForm` の `returnHref` に渡す。無ければ渡さない

### 変更: `src/app/words/new/word-form.tsx`

- create モードの `backHref` を `returnHref ?? "/words"` に変更する。送信成功時の遷移は変更しない（`isEdit && returnHref` ガードのまま）

### 変更: `src/app/words/page.tsx`

- `parsePage` のローカル定義を削除し、`search-params.ts` からの import に差し替える（**このチケットでの変更はこの差し替えのみ**）

## 完了条件（Definition of Done）

- [ ] unit テスト（`search-params.unit.test.ts`）で `parsePage` 移設分・ヘルパ追加分（`/words/new` 用 URL 生成ヘルパの省略規則と、生成 → パース → returnHref 再構築で元の一覧 URL に戻るラウンドトリップを含む）、プリフィル導出（`q` → 正規化 → `headwordSchema` 検証）・returnHref 再構築（純関数に切り出した場合）を検証する
- [ ] 手動確認（dev サーバ・手打ち URL）: `/words/new?q=xxx&sort=headword&match=contains&bookmarked=1&page=2` で headword がプリフィルされ、「戻る」が同条件の一覧へ遷移する。`q` 無しの `/words/new` では従来どおりプリフィルなし・「戻る」は `/words`。送信成功後は既存どおり単語詳細へ（導線リンクはチケット 03 まで存在しないため手打ち URL で確認する。03 の DoD にある導線経由の end-to-end 確認とは目的が異なり重複ではない）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

## 競合注意

- `src/app/words/page.tsx`: チケット 03 も本ファイルを変更する。本チケット（02）を先にマージすること（03 は 02 に依存宣言済み）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
