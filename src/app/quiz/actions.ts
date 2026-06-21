"use server";

import { createDrillForUser } from "@/lib/drill-create";
import { deleteDrillForUser } from "@/lib/drill-delete";
import { generateDrillRoundForUser } from "@/lib/drill-round-generate";
import { submitDrillRoundForUser } from "@/lib/drill-round-submit";
import { submitQuizAnswersForUser } from "@/lib/quiz-answers-submit";
import { generateQuizForUser } from "@/lib/quiz-generate";
import {
  DefaultOccurrenceNotInScopeError,
  saveStartSettingsAsDefaultsForUser,
} from "@/lib/quiz-default-settings";
import { getQuizPreviewForUser, type QuizPreview, type QuizRangeInput } from "@/lib/quiz-preview";
import { mapQuizErrorToResult, type QuizErrorCode } from "@/lib/quiz/error-map";
import type { QuizPayload } from "@/lib/quiz/payload";
import {
  deleteDrillInputSchema,
  getQuizPreviewInputSchema,
  startDrillInputSchema,
  startDrillRoundInputSchema,
  startQuizInputSchema,
  submitDrillRoundInputSchema,
  submitQuizAnswersInputSchema,
  wordIdSchema,
  type DeleteDrillInput,
  type StartDrillInput,
  type StartDrillRoundInput,
  type StartQuizInput,
  type SubmitDrillRoundInput,
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

/** テスト開始前のプレビュー（対象件数・除外内訳）。 */
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

export type SaveStartSettingsAsDefaultsResult = { ok: true } | QuizActionFailure;

/**
 * 開始画面「この設定をデフォルト設定とする」トグル ON でのテスト開始時に、開始画面の入力
 * （掲載箇所・範囲・形式・選択中形式の制限時間）でデフォルトを部分上書きする。テスト開始
 * 自体とは独立（クライアントが非ブロッキングで発火し、失敗してもテストは進める）。
 */
export async function saveStartSettingsAsDefaults(
  input: StartQuizInput,
): Promise<SaveStartSettingsAsDefaultsResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = startQuizInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    await saveStartSettingsAsDefaultsForUser(session.user.id, parsed.data);
    return { ok: true };
  } catch (e) {
    if (e instanceof DefaultOccurrenceNotInScopeError) {
      return {
        ok: false,
        error: "not_found",
        message: "この掲載箇所をデフォルトに設定できませんでした。",
      };
    }
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

export type StartDrillResult = { ok: true; drillId: string } | QuizActionFailure;

/** テスト結果からの drill 生成（format はここで 1 回だけ受け取り `Drill.format` に保存）。 */
export async function startDrill(input: StartDrillInput): Promise<StartDrillResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = startDrillInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const { drillId } = await createDrillForUser(session.user.id, parsed.data);
    return { ok: true, drillId };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}

export type StartDrillRoundResult =
  | { ok: true; quiz: QuizPayload; roundCount: number }
  | QuizActionFailure;

/**
 * drill ラウンド 1 回分の問題生成（初回・再開とも同一経路。形式は `Drill.format` から導出）。
 * roundCount はラウンド送信の expectedRoundCount に使う。
 */
export async function startDrillRound(input: StartDrillRoundInput): Promise<StartDrillRoundResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = startDrillRoundInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const { quiz, roundCount } = await generateDrillRoundForUser(session.user.id, parsed.data);
    return { ok: true, quiz, roundCount };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}

export type SubmitDrillRoundResult =
  | {
      ok: true;
      remaining: { wordId: string; remaining: number }[];
      completed: boolean;
      alreadyApplied: boolean;
    }
  | QuizActionFailure;

/** drill ラウンド終了時の履歴一括送信＋残数更新（roundCount CAS で冪等）。 */
export async function submitDrillRound(
  input: SubmitDrillRoundInput,
): Promise<SubmitDrillRoundResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = submitDrillRoundInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const { remaining, completed, alreadyApplied } = await submitDrillRoundForUser(
      session.user.id,
      parsed.data,
    );
    return { ok: true, remaining, completed, alreadyApplied };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}

export type DeleteDrillResult = { ok: true } | QuizActionFailure;

/** 進行中一覧からの drill 削除（解答履歴 QuizAnswer は残る）。 */
export async function deleteDrill(input: DeleteDrillInput): Promise<DeleteDrillResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = deleteDrillInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    await deleteDrillForUser(session.user.id, parsed.data.drillId);
    return { ok: true };
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
