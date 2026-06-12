"use server";

import { submitQuizAnswersForUser } from "@/lib/quiz-answers-submit";
import { generateQuizForUser } from "@/lib/quiz-generate";
import {
  getQuizPreviewForUser,
  type QuizPreview,
  type QuizRangeInput,
} from "@/lib/quiz-preview";
import { mapQuizErrorToResult, type QuizErrorCode } from "@/lib/quiz/error-map";
import type { QuizPayload } from "@/lib/quiz/payload";
import {
  getQuizPreviewInputSchema,
  startQuizInputSchema,
  submitQuizAnswersInputSchema,
  wordIdSchema,
  type StartQuizInput,
  type SubmitQuizAnswersInput,
} from "@/lib/schema/quiz";
import { getCurrentSession } from "@/lib/session";
import { getWordDetailForUser, type WordDetail } from "@/lib/words-detail";

export type QuizActionError = "unauthorized" | "invalid" | QuizErrorCode;

type QuizActionFailure = { ok: false; error: QuizActionError; message: string };

const UNAUTHORIZED: QuizActionFailure = {
  ok: false,
  error: "unauthorized",
  message: "ログインが必要です。再度ログインしてください。",
};

const INVALID: QuizActionFailure = {
  ok: false,
  error: "invalid",
  message: "入力内容を確認してください。",
};

export type GetQuizPreviewResult = { ok: true; preview: QuizPreview } | QuizActionFailure;

/** テスト開始前のプレビュー（対象件数・除外内訳・形式ごとの成立可否）。 */
export async function getQuizPreview(input: QuizRangeInput): Promise<GetQuizPreviewResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = getQuizPreviewInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const preview = await getQuizPreviewForUser(session.user.id, parsed.data);
    return { ok: true, preview };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}

export type StartQuizResult = { ok: true; quiz: QuizPayload } | QuizActionFailure;

/** テスト開始: 完成品の問題データ一式を生成して返す。 */
export async function startQuiz(input: StartQuizInput): Promise<StartQuizResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = startQuizInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const quiz = await generateQuizForUser(session.user.id, parsed.data);
    return { ok: true, quiz };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}

export type SubmitQuizAnswersResult =
  | { ok: true; savedCount: number; skippedWordIds: string[] }
  | QuizActionFailure;

/** テスト解答履歴の一括送信（mode=TEST はサーバーが経路で決める）。 */
export async function submitQuizAnswers(
  input: SubmitQuizAnswersInput,
): Promise<SubmitQuizAnswersResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = submitQuizAnswersInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const { savedCount, skippedWordIds } = await submitQuizAnswersForUser(
      session.user.id,
      parsed.data,
    );
    return { ok: true, savedCount, skippedWordIds };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}

export type GetWordDetailForDialogResult = { ok: true; word: WordDetail } | QuizActionFailure;

/** 結果画面の単語詳細ダイアログ用。既存 `getWordDetailForUser` の薄いラッパ。 */
export async function getWordDetailForDialog(
  wordId: string,
): Promise<GetWordDetailForDialogResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = wordIdSchema.safeParse(wordId);
  if (!parsed.success) return INVALID;

  try {
    const word = await getWordDetailForUser(session.user.id, parsed.data);
    if (!word) {
      return { ok: false, error: "not_found", message: "対象の単語が見つかりません。" };
    }
    return { ok: true, word };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}
