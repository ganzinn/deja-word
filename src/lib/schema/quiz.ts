import { z } from "zod/v3";

import type { DrillResultInput } from "@/lib/drill-create";
import type { AnswerInput } from "@/lib/quiz/handlers/quiz-answer-handler";
import type { DrillRoundInput } from "@/lib/quiz/handlers/drill-round-handler";
import { ALL_QUIZ_FORMATS } from "@/lib/quiz/format-options";
import { TIMEOUT_MAX_SECONDS, TIMEOUT_MIN_SECONDS } from "@/lib/quiz/timeout-options";
import type { QuizRangeInput } from "@/lib/quiz-preview";
import type { QuizFormat } from "@/generated/prisma/enums";

/**
 * テスト範囲の入力（05-architecture.md 決定 2）。
 * mode と ownerId はサーバー側（経路とセッション）で決まるため含めない。
 * rangeFrom > rangeTo はスキーマでは拒否しない（対象 0 件として下流の
 * partitionMaterial / checkFormatAvailability が「成立しない」と扱う）。
 */
export const quizRangeInputSchema = z.object({
  occurrenceId: z.string().min(1),
  rangeFrom: z.number().int().positive().optional(),
  rangeTo: z.number().int().positive().optional(),
}) satisfies z.ZodType<QuizRangeInput>;

// 形式リストは ALL_QUIZ_FORMATS（FORMAT_GROUPS 由来）を単一の出どころとする。
// 形式追加は enum 値＋FORMAT_GROUPS への追記だけでここに波及する。
export const quizFormatSchema = z.enum(ALL_QUIZ_FORMATS as [QuizFormat, ...QuizFormat[]]);

/** 1 問あたりの制限時間（秒）。null = 制限なしは各入力スキーマ側で .nullable() を付けて表現する。 */
export const quizTimeoutSecondsSchema = z
  .number()
  .int()
  .min(TIMEOUT_MIN_SECONDS)
  .max(TIMEOUT_MAX_SECONDS);

/**
 * 出題形式ごとの制限時間（デフォルト設定）。全形式キーを必須で持つ map で、
 * 各値は 1..60 整数 または null（その形式は制限なし）。形式リストは
 * ALL_QUIZ_FORMATS（FORMAT_GROUPS 由来）を単一の出どころとする。
 */
export const quizTimeoutByFormatSchema = z.object(
  Object.fromEntries(ALL_QUIZ_FORMATS.map((f) => [f, quizTimeoutSecondsSchema.nullable()])),
) as unknown as z.ZodType<Record<QuizFormat, number | null>>;

/** 1 解答分の入力。format は持たない（送信トップレベルで 1 回だけ送る。決定 2）。 */
export const answerInputSchema = z.object({
  wordId: z.string().min(1),
  result: z.enum(["CORRECT", "INCORRECT", "GAVE_UP", "TIMEOUT"]),
}) satisfies z.ZodType<AnswerInput>;

// ---- 各 Server Action の入力スキーマ ----

/** `getQuizPreview` の入力。 */
export const getQuizPreviewInputSchema = quizRangeInputSchema;

/** `startQuiz` の入力。 */
export const startQuizInputSchema = quizRangeInputSchema.extend({
  format: quizFormatSchema,
  timeoutSeconds: quizTimeoutSecondsSchema.nullable(),
  // 四択（英→日）の選択肢表示。CHOICE 以外では下流で無視される。
  choiceFirstMeaningTextOnly: z.boolean(),
});

/** `submitQuizAnswers` の入力。テストは常に 1 問以上のため空の answers は不正とする。 */
export const submitQuizAnswersInputSchema = z.object({
  format: quizFormatSchema,
  answers: z.array(answerInputSchema).min(1),
});

/** `getWordDetailForDialog` の入力（wordId 単体）。 */
export const wordIdSchema = z.string().min(1);

/**
 * `saveQuizDefaults` の入力（開始画面デフォルト設定）。
 * 全項目 nullable: Occurrence 削除（DB の SetNull）で「format だけ残る」状態が必ず
 * 生じるため、部分的なデフォルトをフォームでも表現・保存できるようにする。
 * rangeFrom > rangeTo は quizRangeInputSchema と同方針で拒否しない。
 */
export const saveQuizDefaultsInputSchema = z.object({
  occurrenceId: z.string().min(1).nullable(),
  rangeFrom: z.number().int().positive().nullable(),
  rangeTo: z.number().int().positive().nullable(),
  format: quizFormatSchema.nullable(),
  timeoutByFormat: quizTimeoutByFormatSchema,
  showCountdown: z.boolean().nullable(),
  autoplayPronunciation: z.boolean().nullable(),
  enableAnswerSound: z.boolean().nullable(),
  autoplayAnswerAudioJaEn: z.boolean().nullable(),
  choiceFirstMeaningTextOnly: z.boolean().nullable(),
  saveOnStart: z.boolean().nullable(),
});

// ---- drill 系 Server Action の入力スキーマ ----

/** 元テスト 1 問分の結果（`startDrill` の results 要素。05-architecture.md 決定 2）。 */
export const drillResultInputSchema = z.object({
  wordId: z.string().min(1),
  correct: z.boolean(),
}) satisfies z.ZodType<DrillResultInput>;

/**
 * `startDrill` の入力。format / timeoutSeconds はここで 1 回だけ受け取り
 * `Drill` に保存して全ラウンドで引き継ぐ（06-drill-mode.md 決定 4）。
 * テストは常に 1 問以上のため空の results は不正とする。
 */
export const startDrillInputSchema = z.object({
  occurrenceId: z.string().min(1),
  format: quizFormatSchema,
  timeoutSeconds: quizTimeoutSecondsSchema.nullable(),
  choiceFirstMeaningTextOnly: z.boolean(),
  results: z.array(drillResultInputSchema).min(1),
});

/** `startDrillRound` の入力（初回・再開とも同一経路。形式は `Drill.format` から導出）。 */
export const startDrillRoundInputSchema = z.object({
  drillId: z.string().min(1),
});

/**
 * `submitDrillRound` の入力。expectedRoundCount は `startDrillRound` 応答の
 * roundCount をそのまま返す（CAS 冪等の期待値。05-architecture.md 決定 4）。
 */
export const submitDrillRoundInputSchema = z.object({
  drillId: z.string().min(1),
  expectedRoundCount: z.number().int().nonnegative(),
  answers: z.array(answerInputSchema).min(1),
}) satisfies z.ZodType<DrillRoundInput>;

/** `deleteDrill` の入力。 */
export const deleteDrillInputSchema = z.object({
  drillId: z.string().min(1),
});

export type StartQuizInput = z.infer<typeof startQuizInputSchema>;
export type SaveQuizDefaultsInput = z.infer<typeof saveQuizDefaultsInputSchema>;
export type SubmitQuizAnswersInput = z.infer<typeof submitQuizAnswersInputSchema>;
export type StartDrillInput = z.infer<typeof startDrillInputSchema>;
export type StartDrillRoundInput = z.infer<typeof startDrillRoundInputSchema>;
export type SubmitDrillRoundInput = z.infer<typeof submitDrillRoundInputSchema>;
export type DeleteDrillInput = z.infer<typeof deleteDrillInputSchema>;
