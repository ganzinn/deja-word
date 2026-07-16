"use server";

import { getBookmarkedWordIdsForUser } from "@/lib/bookmark-settings";
import { createDrillForUser } from "@/lib/drill-create";
import { deleteDrillForUser } from "@/lib/drill-delete";
import { generateDrillRetryForUser } from "@/lib/drill-retry-generate";
import { submitDrillRetryForUser } from "@/lib/drill-retry-submit";
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
  adjacentWordsInputSchema,
  deleteDrillInputSchema,
  getQuizPreviewInputSchema,
  startDrillInputSchema,
  startDrillRetryInputSchema,
  startDrillRoundInputSchema,
  startQuizInputSchema,
  submitDrillRetryInputSchema,
  submitDrillRoundInputSchema,
  submitQuizAnswersInputSchema,
  wordIdSchema,
  type AdjacentWordsInput,
  type DeleteDrillInput,
  type StartDrillInput,
  type StartDrillRetryInput,
  type StartDrillRoundInput,
  type StartQuizInput,
  type SubmitDrillRetryInput,
  type SubmitDrillRoundInput,
  type SubmitQuizAnswersInput,
} from "@/lib/schema/quiz";
import { getCurrentSession } from "@/lib/session";
import { getWordDetailForUser, type WordDetail } from "@/lib/words-detail";
import { findAdjacentWordsByOccurrenceNumber, type AdjacentWordsResult } from "@/lib/words-list";
import type { QuizFormat } from "@/generated/prisma/enums";

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

/**
 * テスト開始前のプレビュー（対象件数・除外内訳）。format は任意で、TG 例文形式のときだけ
 * 対象件数・除外内訳が形式依存（TG 例文の有無で絞る）になる。
 */
export async function getQuizPreview(
  input: QuizRangeInput & { format?: QuizFormat },
): Promise<GetQuizPreviewResult> {
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
  | {
      ok: true;
      quiz: QuizPayload;
      roundCount: number;
      sourceTest: StartQuizInput;
      occurrenceName: string;
    }
  | QuizActionFailure;

/**
 * drill ラウンド 1 回分の問題生成（初回・再開とも同一経路。形式は `Drill.format` から導出）。
 * roundCount はラウンド送信の expectedRoundCount に使う。
 * sourceTest は完了画面の「同じ範囲でもう一度テストする」の開始入力、occurrenceName は
 * その範囲表示に使う掲載箇所名（docs/adr/0042-retest-same-range.md）。
 */
export async function startDrillRound(input: StartDrillRoundInput): Promise<StartDrillRoundResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = startDrillRoundInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const { quiz, roundCount, sourceTest, occurrenceName } = await generateDrillRoundForUser(
      session.user.id,
      parsed.data,
    );
    return { ok: true, quiz, roundCount, sourceTest, occurrenceName };
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

export type StartDrillRetryResult = { ok: true; quiz: QuizPayload } | QuizActionFailure;

/**
 * 「同じ問題で再テスト」の問題生成（docs/adr/0041-drill-retry.md）。wordIds は直前ラウンドの
 * 出題単語のクライアント申告。残数に影響しないため roundCount は返さない。
 */
export async function startDrillRetry(input: StartDrillRetryInput): Promise<StartDrillRetryResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = startDrillRetryInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const { quiz } = await generateDrillRetryForUser(session.user.id, parsed.data);
    return { ok: true, quiz };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}

export type SubmitDrillRetryResult =
  | { ok: true; savedCount: number; skippedWordIds: string[] }
  | QuizActionFailure;

/**
 * 「同じ問題で再テスト」の履歴一括送信（mode=DRILL_RETRY はサーバーが経路で決める）。
 * 残数・roundCount・completedAt には触れない（docs/adr/0041-drill-retry.md）。
 */
export async function submitDrillRetry(
  input: SubmitDrillRetryInput,
): Promise<SubmitDrillRetryResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = submitDrillRetryInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const { savedCount, skippedWordIds } = await submitDrillRetryForUser(
      session.user.id,
      parsed.data,
    );
    return { ok: true, savedCount, skippedWordIds };
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

export type GetWordDetailForDialogResult =
  | { ok: true; word: WordDetail; bookmarked: boolean }
  | QuizActionFailure;

/**
 * 結果画面の単語詳細ダイアログ用。既存 `getWordDetailForUser` の薄いラッパ。
 * `bookmarked` は表示専用の `WordDetail` 型に混ぜず並置する（ダイアログヘッダのトグル初期値）。
 */
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
    // read 専用関数は増やさず、1 件配列で本人のブックマーク状態を取得する。
    const bookmarked =
      (await getBookmarkedWordIdsForUser(session.user.id, [parsed.data])).length > 0;
    return { ok: true, word, bookmarked };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}

export type GetAdjacentWordsForDialogResult =
  | { ok: true; nav: AdjacentWordsResult }
  | QuizActionFailure;

/**
 * 結果画面の単語詳細ダイアログ用。掲載箇所全体を掲載番号順に前後移動するための隣接単語を返す。
 * `nav: null` は「掲載番号なし等でナビ対象外」の正常応答（ダイアログはナビを表示しない）。
 */
export async function getAdjacentWordsForDialog(
  input: AdjacentWordsInput,
): Promise<GetAdjacentWordsForDialogResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = adjacentWordsInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const nav = await findAdjacentWordsByOccurrenceNumber(
      session.user.id,
      parsed.data.occurrenceId,
      parsed.data.wordId,
    );
    return { ok: true, nav };
  } catch (e) {
    return mapQuizErrorToResult(e);
  }
}
