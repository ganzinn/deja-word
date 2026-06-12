# 06. quiz-actions

状態: **未着手**　PR: （未作成）

## 目的

quiz 系の Server Action 4 本（プレビュー・テスト開始・履歴送信・単語詳細）と、その入力検証（zod）・エラーマップを実装する。インターフェース層を確立し、チケット 08 の UI が呼べる状態にする。

スコープ外:

- drill 系 4 Action（チケット 10 で同じ `actions.ts` に追記）
- UI コンポーネント（チケット 07・08）

## 依存チケット

- 05: `getQuizPreviewForUser` / `generateQuizForUser` / `submitQuizAnswersForUser` を呼ぶ

## 前提（設計決定の再掲）

- インターフェースは全部 Server Action（Route Handler 追加なし）。`src/app/quiz/actions.ts` に集約（ページが 1 枚のため 1 ファイル）。戻り値は既存の Result 型 `{ ok: true, ... } | { ok: false, error: ErrorCode, message: string }`。zod スキーマは `src/lib/schema/quiz.ts` に新設（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2）
- 本チケット分の Action（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2 の表）:

| 用途 | Action | 入出力 |
| --- | --- | --- |
| プレビュー | `getQuizPreview` | `QuizRangeInput` → 対象件数・除外内訳（番号なし◯語・意味未登録◯語）・形式ごとの成立可否 |
| テスト開始 | `startQuiz` | `QuizRangeInput & { format: QuizFormat }` → `{ quiz: QuizPayload }` |
| テスト履歴送信 | `submitQuizAnswers` | `{ format: QuizFormat, answers: AnswerInput[] }` → `{ savedCount, skippedWordIds }` |
| 単語詳細ダイアログ | `getWordDetailForDialog` | `wordId` → 既存 `getWordDetailForUser` の結果（薄いラッパ） |

- 共通型: `QuizRangeInput = { occurrenceId: string; rangeFrom?: number; rangeTo?: number }`、`AnswerInput = { wordId: string; result: QuizResult }`。mode と ownerId はサーバー側（経路とセッション）で決まり、クライアント入力には含めない（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2）
- format はクライアントが TEST 履歴送信（`submitQuizAnswers`）のトップレベルで 1 回だけ送る（zod の enum で検証。解答ごとの format 指定は許さない）。テストセッションの状態を持たない設計のため、この経路ではサーバー側に format の導出手段がない（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 2）
- エラーマップは `src/lib/quiz/error-map.ts` の `mapQuizErrorToResult`（`words/error-map.ts` と同形: エラークラス → `{ ok: false, error: code, message }` への統一マップ）（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 1）

## 実装内容

### 作成: `src/lib/schema/quiz.ts`（＋ `.unit.test.ts`）

zod スキーマ: `quizRangeInputSchema`（occurrenceId 必須、rangeFrom / rangeTo は optional の正整数）、`quizFormatSchema`（`z.enum(["CHOICE", "SELF_JUDGE", "MULTI_MEANING"])`）、`answerInputSchema`（wordId＋result の enum）、およびこれらを組んだ各 Action の入力スキーマ。既存 `word-form.ts` の形式に合わせる。

### 作成: `src/lib/quiz/error-map.ts`

`mapQuizErrorToResult(e: unknown)`: 05 の UseCase が投げるエラークラス（Occurrence NotFound 系・形式不成立の生成エラー等）を Result 型へマップ。未知のエラーは re-throw（既存 `words/error-map.ts` と同じ方針）。

### 作成: `src/app/quiz/actions.ts`（＋ `.unit.test.ts`）

`"use server"`。4 Action とも既存パターン（`words/new/actions.ts` 等）に合わせる: `getCurrentSession()` → 未認証は `{ ok: false, error: "unauthorized" }` → zod `safeParse` → 不正は `{ ok: false, error: "invalid" }` → UseCase 呼び出し → catch で `mapQuizErrorToResult`。

- `getQuizPreview` → `getQuizPreviewForUser`
- `startQuiz` → `generateQuizForUser`
- `submitQuizAnswers` → `submitQuizAnswersForUser`
- `getWordDetailForDialog` → 既存 `getWordDetailForUser`（`src/lib/words-detail.ts`）の薄いラッパ

## 完了条件（Definition of Done）

- [ ] `actions.ts` の unit test: 認証なし・zod 不正（format に不正値、answers の result に不正値を含む）・エラーマップ（UseCase エラー → Result 変換）を既存 actions の unit test と同じモックパターンで検証（[05-architecture.md](../../design/word-quiz/05-architecture.md) 決定 9）
- [ ] `src/lib/schema/quiz.ts` の unit test（境界値: rangeFrom > rangeTo の扱い、負数・小数の拒否）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:unit` が通る

## 競合注意

- `src/app/quiz/actions.ts` / `src/lib/quiz/error-map.ts` / `src/lib/schema/quiz.ts`: チケット 10 が drill 系を追記する（10 は本チケット・08・09 のマージ後に着手すること）

## 実装メモ

（実装セッションが記入する。計画との差分・後続チケットへの申し送り）
