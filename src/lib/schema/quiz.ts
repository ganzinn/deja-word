import { z } from "zod/v3";

import type { AnswerInput } from "@/lib/quiz/handlers/quiz-answer-handler";
import type { QuizRangeInput } from "@/lib/quiz-preview";

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

export const quizFormatSchema = z.enum(["CHOICE", "SELF_JUDGE", "MULTI_MEANING"]);

/** 1 解答分の入力。format は持たない（送信トップレベルで 1 回だけ送る。決定 2）。 */
export const answerInputSchema = z.object({
  wordId: z.string().min(1),
  result: z.enum(["CORRECT", "INCORRECT", "GAVE_UP"]),
}) satisfies z.ZodType<AnswerInput>;

// ---- 各 Server Action の入力スキーマ ----

/** `getQuizPreview` の入力。 */
export const getQuizPreviewInputSchema = quizRangeInputSchema;

/** `startQuiz` の入力。 */
export const startQuizInputSchema = quizRangeInputSchema.extend({
  format: quizFormatSchema,
});

/** `submitQuizAnswers` の入力。テストは常に 1 問以上のため空の answers は不正とする。 */
export const submitQuizAnswersInputSchema = z.object({
  format: quizFormatSchema,
  answers: z.array(answerInputSchema).min(1),
});

/** `getWordDetailForDialog` の入力（wordId 単体）。 */
export const wordIdSchema = z.string().min(1);

export type StartQuizInput = z.infer<typeof startQuizInputSchema>;
export type SubmitQuizAnswersInput = z.infer<typeof submitQuizAnswersInputSchema>;
