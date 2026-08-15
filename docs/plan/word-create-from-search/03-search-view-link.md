# 03. search-view-link

状態: **完了**（2026-08-15）　PR: [#260](https://github.com/ganzinn/deja-word/pull/260)

## 目的

単語ビュー（`/words` の `WordView`）で、発動条件成立時に件数行直下へ「＋ 「{表示語}」を登録」の導線リンクを表示する。完全一致判定（チケット 01 の関数）を一覧取得と並列に実行する。本チケットのマージで導線がユーザーに露出する（機能の終端配線）。

スコープ外: 判定関数の実装はチケット 01。`/words/new` 側の受け口・URL 生成ヘルパはチケット 02。ドキュメント・スクリーンショット更新はチケット 04。**導線を出すのは単語ビュー（`WordView`）のみ**で、同ファイルに同居する掲載箇所ビュー（`OccurrenceView`）と登録フォーム内の関連語ピッカーには出さない（[01-requirements.md](../../design/word-create-from-search/01-requirements.md) 決定 1）。検索仕様そのもの（照合規則・一致方法・並び順・ページング）と件数行の表示も変更しない（[01-requirements.md](../../design/word-create-from-search/01-requirements.md) 決定 3）。

## 依存チケット

- 01: 完全一致判定関数 `hasExactHeadwordForUser` を呼び出す
- 02: 導線リンク先 `/words/new?<一覧コンテキスト>` の受け口（プリフィル・returnHref）が機能していること。また `parsePage` 移設で本チケットと同じ `src/app/words/page.tsx` を触るため先行させる

## 前提（設計決定の再掲）

- 発動条件: 「有効な検索語あり、かつ正規化後キーワードが headword 最大長（100 文字）以内、かつ可視範囲（system＋自分）に完全一致 headword なし」。発動条件を満たすとき、検索結果の件数にかかわらず導線を表示する（部分一致ヒットがあっても表示。ゼロ件でも表示）。一致方法（から始まる／を含む／で終わる）・ブックマーク絞り込み・ページングには依存しない（[01-requirements.md](../../design/word-create-from-search/01-requirements.md) 決定 2）
- 呼び出し側の実装: `WordView`（RSC）で `const keyword = normalizeSearchKeyword(q)` を **1 回だけ計算**して使い回す。導線の表示条件は「`keyword` が空でない、かつ `keyword.length` が `SHORT_TEXT_MAX_LENGTH`（= 100）以内、かつ `!(await hasExactHeadwordForUser(userId, keyword))`」。**前 2 条件を満たすときのみ判定関数を呼び**、`listWordsForUser` と `Promise.all` で並列に実行する（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 1）
- 導線の表示: 検索結果の件数行（「「run」の検索結果: n 件」）の直下に 1 箇所、**＋アイコン付き**の「「{表示語}」を登録」の**控えめな小さいテキストリンク**（大きなバナー・ボタンにしない。＋は既存の空状態ボタン・ヘッダと同じ lucide `PlusIcon` を使う）。ゼロ件・部分一致ヒットありのどちらも同じ位置で、ゼロ件時の空状態（「該当する単語はありません」）の表示は変更しない。2 ページ目以降でも同様に表示される（[02-ui.md](../../design/word-create-from-search/02-ui.md) 決定 1）
- 導線の表示語は正規化後キーワード `keyword`（大文字小文字は保持。プリフィルも `/words/new` 側で同じ正規化から導出されるため表示語・判定値・プリフィル値の 3 者が一致する）。件数行の表示（「「{q}」の検索結果」）は従来どおり trim 済み入力値のままで変更しない（[02-ui.md](../../design/word-create-from-search/02-ui.md) 決定 2、[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 1）
- リンク先 URL: `/words/new?<一覧コンテキスト>`。一覧コンテキストは現在の検索条件 `q` / `sort` / `match` / `bookmarked` / `page` をそのまま渡す。`q` に入れる値は URL・件数行と同じ **trim 済み入力値**（表示語とは別値になりうる。正規化後を載せると、アクセント付き入力時に戻り先 URL が元の一覧と別の検索になるため）。プリフィル専用パラメータや生の戻り先 URL は渡さない（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 2）。URL の組み立ては自前で行わず、チケット 02 が `search-params.ts` に追加した `/words/new` 用 URL 生成ヘルパを呼ぶ（省略規則・エンコードの契約を 02 の 1 箇所＋unit テストに閉じるため）
- 導線はページ内ローカルコンポーネントとして実装する（新規ファイルは作らない）（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 3）

## 実装内容

### 変更: `src/app/words/page.tsx`

- `WordView` で `keyword = normalizeSearchKeyword(q)` を 1 回計算し、前提の表示条件・並列実行（`Promise.all`）を実装する（`normalizeSearchKeyword` は `src/lib/search-keyword.ts`、`SHORT_TEXT_MAX_LENGTH` は `src/lib/schema/content-limits.ts`、`hasExactHeadwordForUser` は `src/lib/words-list.ts`）
- 件数行直下に導線のローカルコンポーネントを追加する（`PlusIcon`＋文言「「{keyword}」を登録」、リンク先はチケット 02 の URL 生成ヘルパで組み立てる）

## 完了条件（Definition of Done）

- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] 手動確認（e2e-verify スキル）: ゼロ件で導線表示・部分一致ありで表示・2 ページ目以降でも表示・完全一致ありで非表示・記号のみ等の正規化後空の検索語で非表示・101 文字以上の検索語で非表示・ブックマーク絞り込み中（完全一致が結果に出ない状態）でも非表示・アクセント付き入力で表示語とプリフィルが正規化後の値で一致・「戻る」で検索条件（`q` / `sort` / `match` / `bookmarked` / `page`）が維持される

## 競合注意

- `src/app/words/page.tsx`: チケット 02 が `parsePage` の import 差し替えで先に触る。02 のマージ後に着手すること（依存宣言済み）

## 実装メモ

- 変更は `src/app/words/page.tsx` の 1 ファイルのみ。導線は同ファイル内のローカルコンポーネント `CreateWordLink`（新規ファイルなし）
- 表示条件は `keywordCreatable = keyword.length > 0 && keyword.length <= SHORT_TEXT_MAX_LENGTH` と `!hasExactMatch` に分離。`keywordCreatable` が偽なら `hasExactHeadwordForUser` を呼ばず `Promise.resolve(false)` を渡し、`listWordsForUser` と `Promise.all` で並列実行
- **リンク先 URL の `page` には生の `page` ではなく総ページ数で丸めた `currentPage` を渡した**。通常時（`page <= totalPages`）は同値。差が出るのは「総件数 0 件かつ URL に範囲外の `page` 指定」のときだけで、その場合リンク先／戻り先が 1 ページ目になる（範囲外ページの条件を持ち回るより自然）。`total > 0` の範囲外は手前で `redirect` されるため到達しない
- 件数行と導線を `<div className="flex flex-col gap-2">` でまとめた（`WordsShell` 直下の `gap-4` より詰めるため）。導線非表示時も同じ div でラップされるが件数行の見た目は不変。`OccurrenceView` 側の `ResultCount` は未変更
- **チケット 04 への申し送り**: 導線は単語ビューの件数行直下に 1 箇所、文言は「＋ 「{正規化後キーワード}」を登録」。撮影は未登録語で検索した `/words?q=...` を撮ると導線と空状態が同時に写る
