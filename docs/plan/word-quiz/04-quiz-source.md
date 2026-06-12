# 04. quiz-source

状態: **未着手**　PR: （未作成）

## 目的

問題生成・プレビューの素材を 1 クエリで取得する `fetchQuizSource` を実装し、可視性スコープ・除外条件を integration test で実 DB 検証する。あわせてテスト用 fixture（番号付き／番号なし／意味なし単語）を追加する。

スコープ外:

- 取得行の分割（`partitionMaterial`、チケット 03）と成立判定（同 `checkFormatAvailability`）
- プレビュー・問題生成の UseCase（チケット 05）

## 依存チケット

- 02: QuizAnswer 等のスキーマ自体は使わないが、マイグレーション一括方針のため 02 を先行させる（実体の依存は薄く、03 と並行着手可）

## 前提（設計決定の再掲）

- `src/lib/quiz/queries/quiz-source.ts` の `fetchQuizSource(userId, occurrenceId)` が、ユーザーの全可視単語（MeaningText 1 件以上）を一括取得する（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 8）:

```ts
// prisma.word.findMany({
//   where: { ownerId: { in: allowed }, meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } } },
//   select: { id, headword,
//     meanings: { where/orderBy: 既存 detail と同様, select: { partOfSpeech, pronunciationAudioUrl, texts: { text } } },
//     wordOccurrences: { where: { occurrenceId, ownerId: { in: allowed } }, select: { occurrenceNumber } } } })
```

- 認可は `scopedOwnerIds` の where 句注入。Word / Meaning / MeaningText / WordOccurrence の全階層に `ownerId: { in: allowed }` を適用（既存 `getWordDetailForUser` と同形）。「全登録単語」の定義は scopedOwnerIds 範囲（system＋自分）。EditorContext / row-policy は使わない（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 5）
- 意味（MeaningText）が 1 件も登録されていない単語は出題対象から除外（上記クエリの `meanings.some.texts.some` 条件で実現）（[03-algorithm.md](../../design/word-quiz/03-algorithm.md) 「出題対象の例外: 意味未登録の単語は除外」）
- 範囲指定の対象は occurrenceNumber 付きの単語のみ（既存スキーマで nullable のため）（[README.md](../../design/word-quiz/README.md) 確定事項サマリ）
- 除外内訳（番号なし◯語・意味未登録◯語）のカウントは別途 count クエリで取る（意味未登録の単語は上記クエリに現れないため）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 8）

## 実装内容

### 作成: `src/lib/quiz/queries/quiz-source.ts`（＋ `.integration.test.ts`）

- `fetchQuizSource(userId: string, occurrenceId: string)`: 前提のクエリ形。`server-only` を付ける（クエリ層のため）。Occurrence 自体の存在・可視性確認（`findFirst({ where: { id, ownerId: { in: scopedOwnerIds(userId) } } })`、不在は NotFound 系エラー）もここか呼び出し元 UseCase 冒頭で行う方針を既存 words 系に合わせて実装（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 5）
- `countQuizSourceExclusions(userId: string, occurrenceId: string): Promise<{ noNumber: number; noMeaning: number }>`（同ファイル内）: 対象 Occurrence 内の「occurrenceNumber なし」件数と「意味未登録」件数を count クエリで返す（関数名・戻り値型はチケットでの具体化。要件は [05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 8）。チケット 05 の `getQuizPreviewForUser` が呼ぶ

戻り値は Prisma の select 結果（行配列＋除外内訳）のままとし、`QuizSourceMaterial` への変換（partition）はチケット 03 の純関数に委ねる。

### 変更: `tests/setup/fixtures.ts`

既存の `createWordRow` / `createOccurrenceRow` パターンに合わせて追加する:

- 番号付き単語（occurrenceNumber あり＋MeaningText あり）
- 番号なし単語（WordOccurrence はあるが occurrenceNumber が null）
- 意味なし単語（MeaningText 0 件）

を作れる fixture 関数（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）。

## 完了条件（Definition of Done）

- [ ] `fetchQuizSource` の integration test（`*.integration.test.ts`、実 DB）: 可視性スコープ（自分の単語＋system 単語は見える／他ユーザーの単語は見えない）・意味未登録の単語が結果に現れない・番号なし単語の occurrenceNumber が null で返る（除外判定は 03 の partition 側）・除外内訳カウントの正しさ、を検証（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:integration` が通る

## 競合注意

- `tests/setup/fixtures.ts`: 本チケットで追加。チケット 09 が再利用する（09 はチケット 05 経由の直列依存のため競合しない）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
