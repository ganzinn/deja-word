# 05. quiz-usecases

状態: **実装中**　PR: （未作成）

## 目的

通常テスト（mode=TEST）のサーバーロジックを完成させる: プレビュー・問題一括生成・履歴一括保存の 3 UseCase と、履歴保存 handler（`insertQuizAnswers`）・handlers 共通基盤（`shared.ts`）。

スコープ外:

- Server Action 層・zod 検証・エラーマップ（チケット 06）
- drill 系 UseCase（チケット 09）

## 依存チケット

- 03: `buildQuiz` / `checkFormatAvailability` / `partitionMaterial`（`QuizSourceMaterial`）を使う
- 04: `fetchQuizSource`＋除外内訳カウントを使う

## 前提（設計決定の再掲）

- UseCase は `src/lib/` 直下フラット。本チケット分は `quiz-preview.ts`（`getQuizPreviewForUser`）/ `quiz-generate.ts`（`generateQuizForUser`）/ `quiz-answers-submit.ts`（`submitQuizAnswersForUser`）。handler は `src/lib/quiz/handlers/quiz-answer-handler.ts`（`insertQuizAnswers(tx, ...)`）と `shared.ts`（Tx 型。`words/handlers/shared.ts` と同定義だが words への依存を作らない）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 1）
- プレビューの返却内容: 対象件数・除外内訳（番号なし◯語・意味未登録◯語）・形式ごとの成立可否。入力は `QuizRangeInput = { occurrenceId: string; rangeFrom?: number; rangeTo?: number }`（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2）
- 問題生成の返却は `{ quiz: QuizPayload }` 相当（テスト開始）。入力は `QuizRangeInput & { format: QuizFormat }`（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2）
- プレビューと問題生成は同じ `fetchQuizSource`＋`checkFormatAvailability` を共有する。開始ボタンの成立判定と生成時の成立判定が同一ロジックになり、「プレビューでは成立・生成でエラー」の乖離が（レース以外で）起きない（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 8）
- 認可: 各 UseCase 冒頭で Occurrence を `findFirst({ where: { id, ownerId: { in: scopedOwnerIds(userId) } } })` 確認、不在は NotFound 系エラー（存在を漏らさない）。QuizAnswer は常にユーザー単独所有のため `ownerId: userId`。`ownerId` は常にセッション由来でクライアント入力に含めない。handler シグネチャは `(tx: Tx, userId: string, ...)` とし EditorContext を取らない（words との意図的な相違）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 5）
- 履歴保存（`submitQuizAnswersForUser`）: 入力は `{ format: QuizFormat, answers: AnswerInput[] }`（`AnswerInput = { wordId: string; result: QuizResult }`）、返却は `{ savedCount, skippedWordIds }`。mode（TEST）はサーバーが経路で決める（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2）
- 単語削除耐性: tx 内で `tx.word.findMany({ where: { id: { in: wordIds }, ownerId: { in: scopedOwnerIds(userId) } } })` で存在確認し、実在分のみ `tx.quizAnswer.createMany`。FK 違反で全件失敗させない。`skippedWordIds` を返す（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 3）
- 成否不明後の再送による履歴行の重複は MVP 許容（多重送信防止はチケット 08 のクライアント single-flight が一次防御）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 3）
- 解答履歴は正誤・日時・出題形式を単語単位で記録し、テスト終了時に一括送信される（[01-requirements.md](../../design/word-quiz/01-requirements.md) 「結果の記録: 単語ごとの解答履歴を永続化」）

## 実装内容

### 作成: `src/lib/quiz/handlers/shared.ts`

`Tx` 型（`words/handlers/shared.ts` と同定義をコピー。words から import しない）。

### 作成: `src/lib/quiz/handlers/quiz-answer-handler.ts`（＋ `.unit.test.ts`）

`insertQuizAnswers(tx: Tx, userId: string, input: { mode: QuizMode; format: QuizFormat; answers: AnswerInput[] })`: 存在確認フィルタ → 実在分のみ `tx.quizAnswer.createMany`（ownerId=userId 付与）→ `{ savedCount, skippedWordIds }` を返す。mode を引数に取り、TEST（本チケット）と DRILL（チケット 09）で共有する。

### 作成: `src/lib/quiz-preview.ts`

`getQuizPreviewForUser(userId: string, input: QuizRangeInput): Promise<QuizPreview>`: Occurrence 可視性確認 → `fetchQuizSource`＋`countQuizSourceExclusions`（チケット 04）→ `partitionMaterial` → 全形式分の `checkFormatAvailability` → 対象件数・除外内訳・形式ごとの成立可否（不成立理由つき）を返す。

戻り値型（チケットでの具体化。要件は [05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2「対象件数・除外内訳・形式ごとの成立可否」）:

```ts
type QuizPreview = {
  targetCount: number;
  excluded: { noNumber: number; noMeaning: number };
  formats: { format: QuizFormat; available: boolean; reason: string | null }[];
};
```

### 作成: `src/lib/quiz-generate.ts`

`generateQuizForUser(userId: string, input: QuizRangeInput & { format: QuizFormat }): Promise<QuizPayload>`: Occurrence 可視性確認 → `fetchQuizSource` → `partitionMaterial` → `checkFormatAvailability`（不成立はエラー）→ `buildQuiz(format, material, Math.random)` → `QuizPayload` を返す。

### 作成: `src/lib/quiz-answers-submit.ts`（＋ `.integration.test.ts`）

`submitQuizAnswersForUser(userId: string, input: { format: QuizFormat; answers: AnswerInput[] }): Promise<{ savedCount: number; skippedWordIds: string[] }>`: `prisma.$transaction` 内で `insertQuizAnswers(tx, userId, { mode: "TEST", format, answers })` を呼ぶ薄い UseCase。

## 完了条件（Definition of Done）

- [ ] `quiz/handlers/` の unit test: `tests/setup/tx-mock.ts` の delegate（02 で追加済み）を流用し、存在確認フィルタ（実在分のみ createMany・skippedWordIds 返却）を検証（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）
- [ ] `submitQuizAnswersForUser` の integration test: 削除済み単語を含む answers を送ると実在分のみ保存され `skippedWordIds` に削除分が入ること（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る

## 競合注意

- `src/lib/quiz/handlers/`: チケット 09 が `drill-round-handler.ts` を同ディレクトリに追加し `shared.ts`・`insertQuizAnswers` を使う（09 は本チケットのマージ後に着手すること）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
