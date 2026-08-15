# 01. exact-match-check

状態: **完了**（2026-08-15）　PR: （未作成）

## 目的

可視範囲（system＋自分）に検索語と完全一致する headword が存在するかを判定する関数を `src/lib/words-list.ts` に追加し、integration テストで検証する。導線表示の発動条件判定（チケット 03）の土台となる。

スコープ外: 呼び出し側（`src/app/words/page.tsx` の並列取得・導線表示）はチケット 03。`/words/new` の受け口はチケット 02。

## 依存チケット

なし（並行着手可）

## 前提（設計決定の再掲）

- 完全一致の定義: 正規化後キーワード（ADR-0084 の `normalizeSearchKeyword` を通した値）と headword の等値比較で、**大文字小文字を区別しない**。比較対象は可視範囲（system＋自分の単語）の全体で、ブックマーク絞り込み・ページングなど表示上の絞り込みには依存しない（[01-requirements.md](../../design/word-create-from-search/01-requirements.md) 決定 2）
- 関数シグネチャ: `hasExactHeadwordForUser(userId: string, keyword: string): Promise<boolean>`。引数 `keyword` は `normalizeSearchKeyword` 適用済みの正規化後キーワード（**正規化は呼び出し側の責務**。防御として空文字なら DB を見ずに `false` を返す）（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 1）
- 実装は `ownerId: { in: scopedOwnerIds(userId) }` かつ `headword: { equals: keyword, mode: "insensitive" }` の存在チェック。ブックマーク・ページングの条件は入力に持たない（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 1）
- `src/lib/words-duplicate.ts` は一意制約 `@@unique([ownerId, headword])` と挙動を揃えるため意図的に大文字小文字を区別する equals を使っている。本関数は目的が異なり（書き込みガードではなく検索の照合規則に合わせた表示判定）、`mode: "insensitive"` を使う。**この使い分けを新関数のコメントに残す**（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 1）
- アクセント正規化は関数の入力前提のため integration テストでは扱わない（正規化関数自体の既存 unit テスト `search-keyword.unit.test.ts` と手動観点で担保）（[03-architecture.md](../../design/word-create-from-search/03-architecture.md) 決定 4）

## 実装内容

### 変更: `src/lib/words-list.ts`

`hasExactHeadwordForUser(userId: string, keyword: string): Promise<boolean>` を追加する。

- `keyword` が空文字なら DB アクセスせず `false` を返す
- `ownerId: { in: scopedOwnerIds(userId) }` かつ `headword: { equals: keyword, mode: "insensitive" }` の存在チェック（存在すれば `true`）。`scopedOwnerIds` は `src/lib/system-user.ts` 由来で、同ファイル内 `listWordsForUser` に既存の使用例がある
- `words-duplicate.ts`（大文字小文字を区別する）との使い分けをコメントに残す

### 変更: `src/lib/words-list.integration.test.ts`

`hasExactHeadwordForUser` のテストを追加する（検証観点は完了条件を参照）。

## 完了条件（Definition of Done）

- [ ] integration テストで以下を検証する: (a) 自分の単語に一致 → true、(b) system 単語に一致 → true、(c) 一致なし（部分一致のみ）→ false、(d) 大文字小文字差でも一致扱い、(e) 空文字を渡すと false を返す（防御ガード。検証は戻り値のみ）、(f) 他ユーザーの単語は対象外（ブックマーク・ページング非依存は関数がそれらを入力に持たないことで構造的に担保されるため、テストケースにはしない）
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] オーケストレーターの直列実行で `pnpm test:integration` が通る（実装エージェントは実行しない）

## 実装メモ

計画との差分なし（チケット記載どおりに実装）。

- `hasExactHeadwordForUser` は `src/lib/words-list.ts` の `listWordsForUser` 直後に配置。`buildWordsByOccurrenceWhere` 以降には触れていない
- 空キーワードは DB アクセスせず `false` を返す防御ガードを入れた。**正規化は呼び出し側の責務**（チケット 03 は正規化済みのキーワードを渡すこと）
- `words-duplicate.ts` との使い分け（あちらは一意制約に合わせ大文字小文字を区別、本関数は検索の照合規則に合わせた表示判定）を JSDoc に明記
- integration テストは (a)〜(f) をカバー。ブックマーク・ページング非依存は、関数がそれらの入力を持たないことで構造的に担保しテストケース化していない
