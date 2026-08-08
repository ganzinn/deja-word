# 01. server-bulk-add

状態: **完了（2026-08-08）**　PR: （未作成）

## 目的

ブックマーク一括登録のサーバ側一式を追加する: 入力スキーマ `addBookmarksInputSchema`・UseCase `addBookmarksForUser`・Server Action `addBookmarks`。あわせて設計判断（skip 方式の非対称・error-map 不使用・`bookmark-settings.ts` 相乗り）を長期記録する新規 ADR を 1 本起票する。

スコープ外: UI（対象算出・ボタン・楽観的更新）はチケット 02。機能紹介ドキュメントはチケット 03。既存 `toggleBookmark` / `getBookmarkStates` へのテスト追加はしない。

## 依存チケット

なし（本機能の最初に着手する。02 → 03 が本チケットに直列依存）

## 前提（設計決定の再掲）

- 入力スキーマは `wordIds: z.array(z.string()).min(1).max(BOOKMARK_WORD_IDS_MAX_COUNT)`。`addBookmarksInputSchema` と型 `AddBookmarksInput` を `src/lib/schema/bookmark.ts`（流用する定数と同居）に追加し、上限は既存 `BOOKMARK_WORD_IDS_MAX_COUNT = 3000` を流用する（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 6）
- 既存上限定数の doc コメントを「一括取得 action（06 `getBookmarkStates`）用」から「ブックマーク系一括 action（一括取得・一括登録）用」へ汎用化し、旧「06」参照表記を除去する（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 6）
- 既存 `getBookmarkStatesInputSchema` には `min` を追加しない（0 件取得は無害な正常系。同一ファイル内で片方だけ `min(1)` を持つ非対称は意図的）（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 6）
- UseCase シグネチャ（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 1）:

  ```ts
  async function addBookmarksForUser(
    userId: string,
    wordIds: readonly string[],
  ): Promise<{ bookmarkedWordIds: string[]; skippedWordIds: string[] }>;
  ```

- UseCase の処理手順（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 1。手順 2〜3 はトランザクション内）:
  1. 入口で `wordIds` を一意化する（`uniqueIds`。以降は集合として扱う）
  2. `tx.word.findMany({ where: { id: { in: uniqueIds }, ownerId: { in: scopedOwnerIds(userId) } }, select: { id: true } })` で検証通過した `validIds` を得る
  3. `validIds` が空でなければ `tx.bookmark.createMany({ data: ..., skipDuplicates: true })` で本人行として一括登録（空なら INSERT を発行しない）
  4. `bookmarkedWordIds = validIds`、`skippedWordIds = uniqueIds − validIds` を返す
- 検証で弾かれた wordId（削除済み・scoped 範囲外）は理由を区別せずまとめて skip し、残りを登録する。**全件が弾かれてもエラーにしない**（`ok: true` ＋ `bookmarkedWordIds: []`）。1 件版 `setBookmarkForUser` が範囲外を `forbidden` で拒否するのとの非対称は意図的（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 2）
- UseCase が `prisma.$transaction` を所有し、検証と登録を同一トランザクションで実行する。失敗は常に全体失敗（部分適用なし）。冪等なので再実行が安全（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 3）
- Server Action の型（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 4）:

  ```ts
  type AddBookmarksError = "unauthorized" | "invalid" | "unknown";
  type AddBookmarksResult =
    | { ok: true; bookmarkedWordIds: string[]; skippedWordIds: string[] }
    | { ok: false; error: AddBookmarksError; message: string };

  async function addBookmarks(input: AddBookmarksInput): Promise<AddBookmarksResult>;
  ```

- エラー分岐とメッセージ文言（そのまま使用。[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 4）:
  - セッション無し → `unauthorized` / 「ログインが必要です。再度ログインしてください。」（既存 actions と同一文言）
  - zod 検証失敗 → `invalid` / 「ブックマークの一括登録リクエストが不正です。」
  - UseCase の例外 → `unknown` / 「ブックマークの一括登録に失敗しました。」
- action の制約: `forbidden` 変種は持たない。入力に `mode` は含めない。`revalidatePath` は呼ばない。入力型は `AddBookmarksInput` を import して使う（既存 `getBookmarkStates` のインライン型リテラルとは異なる）。ADR-0016 の Result 型（throw せず ok/error を返す）に従う（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 4）
- 戻り値のセマンティクス: `bookmarkedWordIds` = 操作後に ON 状態にある wordId 群（新規か既存かは区別しない）、`skippedWordIds` = 検証で弾かれた wordId 群。どちらも集合で順序非保証・重複なし。同じ入力での再実行は同じ結果（冪等）（[02-server-action.md](../../design/quiz-result-bulk-bookmark/02-server-action.md) 決定 5）
- UseCase の配置は既存 `src/lib/bookmark-settings.ts` に追加（新規 flat ファイルを作らない）。既存 `setBookmarkForUser` の doc コメントは変更せず、新関数に独自の doc コメントを書く（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 1）
- action は `src/app/words/actions.ts` に追加（`toggleBookmark` / `getBookmarkStates` と同居）。エラー → Result 変換は既存 2 action と同じ try/catch の action 内分岐で、error-map モジュールは導入しない（ADR-0063 の線引きの適用例）。UseCase 内の handler / policy 分割もしない（[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 2）
- 新規 ADR に書く内容（ADR-0063 と相互参照を張る。[04-architecture.md](../../design/quiz-result-bulk-bookmark/04-architecture.md) 決定 2）:
  1. 1 件版（`setBookmarkForUser`）は範囲外を拒否、一括版は skip という非対称
  2. error-map 不使用が ADR-0063 の線引きの適用例であること
  3. `bookmark-settings.ts` への相乗りが ADR-0014 の動詞プレフィクス命名からの明示的逸脱であること

## 実装内容

### 変更: `src/lib/schema/bookmark.ts`

`addBookmarksInputSchema`（`wordIds: z.array(z.string()).min(1).max(BOOKMARK_WORD_IDS_MAX_COUNT)`）と導出型 `AddBookmarksInput` を追加。`BOOKMARK_WORD_IDS_MAX_COUNT` の doc コメントを前提のとおり汎用化。

### 変更: `src/lib/schema/bookmark.unit.test.ts`

`addBookmarksInputSchema` のケースを追記: 空配列の拒否（`min(1)`）／上限ちょうど許容・超過拒否／非配列・非文字列要素の拒否。

### 変更: `src/lib/bookmark-settings.ts`

`addBookmarksForUser(userId, wordIds)` を前提のシグネチャ・処理手順どおり追加。`scopedOwnerIds` による検証パターンは同ファイル既存関数と共有。`$transaction` はこの関数が所有する。

### 変更: `src/lib/bookmark-settings.integration.test.ts`

`addBookmarksForUser` のケースを追加（観点は完了条件を参照）。

### 変更: `src/app/words/actions.ts`

`addBookmarks(input: AddBookmarksInput)` を前提の型・エラー分岐・文言どおり追加。

### 作成: `src/app/words/actions.unit.test.ts`

`addBookmarks` の分岐を検証（観点は完了条件を参照）。形式は先例 `src/app/quiz/actions.unit.test.ts`（session / UseCase のモック）に従う。

### 作成: `docs/adr/` 新規 ADR 1 本

前提に挙げた 3 点を記録し、ADR-0063 と相互参照を張る。番号は起票時の次の空き番号を使い、ファイル名・ステータス行の書式は既存 ADR に倣う。あわせて `docs/adr/README.md` の一覧表に行を追加する。

## 完了条件（Definition of Done）

- [ ] unit: `addBookmarksInputSchema` — 空配列の拒否（`min(1)`）・上限ちょうど許容・超過拒否・非配列/非文字列要素の拒否
- [ ] unit: `addBookmarks` の分岐 — 未ログイン → `unauthorized`／スキーマ違反 → `invalid`／UseCase throw → `unknown`／成功時の `bookmarkedWordIds` / `skippedWordIds` パススルー
- [ ] integration: `addBookmarksForUser` — 一括登録・既ブックマーク済み混在での冪等性（再実行で件数不変）・scoped 外混在（skip され戻り値に入り、DB 副作用なし）・全件 scoped 外・system 所有単語の登録可
- [ ] `pnpm format`（整形）の上で `pnpm format:check` / `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る
- [ ] オーケストレーターの直列実行で `pnpm test:integration` が通る（実装エージェントは実行しない）
- [ ] 新規 ADR が起票され、ADR-0063 側にも相互参照が入り、`docs/adr/README.md` の一覧表に行が追加されている

## 実装メモ

計画からの逸脱なし。以下は計画の範囲内の判断・後続への申し送り。

- ADR 番号は **0094**（`docs/adr/0094-bulk-bookmark-skip-and-colocation.md`）。掲載節は README の「C. アーキテクチャ・レイヤリング」。ADR-0063 の「影響」節から 0094 決定 2 への相互参照を追加済み。
- DoD 記載分に加えたテストケース（+2）: unit「全件 skip でも `ok: true`（`forbidden` 変種を持たないことの担保）」、integration「入力に重複 wordId があると一意化される」。
- `BOOKMARK_WORD_IDS_MAX_COUNT` の doc コメントから、チケット 06 参照に加え実データ件数の記述も除去した（AGENTS.md「ドキュメントに実データの件数を書かない」）。上限値 3000 自体は変更なし。
- **チケット 02 への申し送り**:
  - `addBookmarks({ wordIds })` は成功時 `{ ok: true, bookmarkedWordIds, skippedWordIds }`。`skippedWordIds` が空でないのは**エラーではない**（全件 skip でも `ok: true` ＋ `bookmarkedWordIds: []`）。楽観的更新は `bookmarkedWordIds` を正として確定させる。
  - 入力は `min(1)` のため**空配列で呼ぶと `invalid`**。対象 0 件のときは呼ぶ前に UI 側で弾く（ボタン無効化等）。
  - action は `revalidatePath` を呼ばない（既存 `toggleBookmark` と同方針）。
  - 型は `AddBookmarksInput`（`@/lib/schema/bookmark`）・`AddBookmarksResult`（`@/app/words/actions`）を export 済み。
