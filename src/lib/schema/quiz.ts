import { z } from "zod/v3";

import type { DrillResultInput } from "@/lib/drill-create";
import type { AnswerInput } from "@/lib/quiz/handlers/quiz-answer-handler";
import type { DrillRoundInput } from "@/lib/quiz/handlers/drill-round-handler";
import { ALL_QUIZ_FORMATS } from "@/lib/quiz/format-options";
import { REMAINING_MAX_COUNT, REMAINING_MIN_COUNT } from "@/lib/quiz/remaining-options";
import { TIMEOUT_MAX_SECONDS, TIMEOUT_MIN_SECONDS } from "@/lib/quiz/timeout-options";
import type { QuizFormat } from "@/generated/prisma/enums";

/**
 * 解答系配列（answers / results / wordIds）の上限。仕様は「範囲内全出題」で問題数に
 * 上限が無いため、現実的な最大出題規模（本番実測最大: 掲載箇所あたり 1900 語）の
 * 約 2.6 倍の余裕を取った値。巨大配列による IN 句・createMany の資源枯渇を防ぐ（issue #107）。
 */
export const QUIZ_ANSWERS_MAX_COUNT = 5000;

/** id 入力の上限。cuid は 25 文字で、将来の id 形式変更にも耐える余裕値（issue #107）。 */
export const INPUT_ID_MAX_LENGTH = 64;

// server-action 専用入力のためエラーメッセージは付けない（action 層が汎用メッセージに畳む）。
const idInputSchema = z.string().min(1).max(INPUT_ID_MAX_LENGTH);

/**
 * 掲載箇所未指定（掲載箇所 Select「指定なし」）を許すのは「ブックマーク全件モード」
 * — `bookmarkedOnly: true` かつ範囲未指定 — のときだけ。違反は入口（スキーマ）で拒否する
 * （逆転範囲を拒否しない既存規約とは別扱い。こちらは形として無効。決定 3）。
 * `.extend()` した各 action 入力スキーマにも同じ検証を掛けるため関数として共有する。
 */
function checkQuizRangeCrossField(
  val: { occurrenceId?: string; rangeFrom?: number; rangeTo?: number; bookmarkedOnly: boolean },
  ctx: z.RefinementCtx,
): void {
  if (val.occurrenceId !== undefined) return;
  if (!val.bookmarkedOnly) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["occurrenceId"],
      message: "掲載箇所を指定してください。",
    });
  }
  if (val.rangeFrom !== undefined || val.rangeTo !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rangeFrom"],
      message: "掲載箇所を指定しないときは範囲を指定できません。",
    });
  }
}

/**
 * テスト範囲の入力の ZodObject（フィールド定義のみ。`.extend()` の土台に保つため refine 前）。
 * mode と ownerId はサーバー側（経路とセッション）で決まるため含めない。
 * rangeFrom > rangeTo はスキーマでは拒否しない（対象 0 件として下流の
 * partitionMaterial / checkFormatAvailability が「成立しない」と扱う）。
 * occurrenceId は optional（掲載箇所未指定＝ブックマーク全件モード。上のクロスフィールド検証で門番）。
 * bookmarkedOnly は「ブックマークのみ」絞り込み。`.default(false)` で省略時 false（未更新フォームも後方互換で通る。
 * パース後の型は必須 boolean。決定 1）。
 */
const quizRangeInputObject = z.object({
  occurrenceId: idInputSchema.optional(),
  rangeFrom: z.number().int().positive().optional(),
  rangeTo: z.number().int().positive().optional(),
  bookmarkedOnly: z.boolean().default(false),
});

/**
 * テスト範囲の入力（docs/adr/0017-server-actions-over-route-handlers.md）。
 * 掲載箇所未指定＋範囲のクロスフィールド検証込み（決定 3）。
 */
export const quizRangeInputSchema = quizRangeInputObject.superRefine(checkQuizRangeCrossField);

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

/** 定着までの回数（残数設定の各値）。1..9 の整数。順序のクロスフィールド検証はしない（各独立）。 */
export const quizRemainingCountSchema = z
  .number()
  .int()
  .min(REMAINING_MIN_COUNT)
  .max(REMAINING_MAX_COUNT);

/** 解答結果の値。QuizResult enum と同期させる（生成 enum は import 時の値として使えないため列挙）。 */
export const quizResultSchema = z.enum(["CORRECT", "INCORRECT", "VAGUE", "GAVE_UP", "TIMEOUT"]);

/** 1 解答分の入力。format は持たない（送信トップレベルで 1 回だけ送る）。 */
export const answerInputSchema = z.object({
  wordId: idInputSchema,
  result: quizResultSchema,
}) satisfies z.ZodType<AnswerInput>;

// ---- 各 Server Action の入力スキーマ ----

/**
 * `getQuizPreview` の入力。format は任意（未選択・非 TG 形式ではプレビューが形式非依存のため）。
 * TG 例文形式のときだけ対象件数・除外内訳が TG 例文の有無で絞られる。
 */
export const getQuizPreviewInputSchema = quizRangeInputObject
  .extend({
    format: quizFormatSchema.optional(),
  })
  .superRefine(checkQuizRangeCrossField);

/**
 * `startQuiz` の入力。定着までの回数（残数設定）はテスト結果画面で受け取り `startDrill` に渡すため
 * ここには含めない（テスト生成 `generateQuizForUser` も残数を使わない）。
 */
export const startQuizInputSchema = quizRangeInputObject
  .extend({
    format: quizFormatSchema,
    timeoutSeconds: quizTimeoutSecondsSchema.nullable(),
    // 四択（英→日）の選択肢表示。CHOICE 以外では下流で無視される。
    choiceFirstMeaningTextOnly: z.boolean(),
    // 掲載番号の昇順に出題する（docs/adr/0072-quiz-order-by-occurrence-number.md）。
    // 掲載箇所未指定（全件モード）では掲載番号が無いため下流で無視される。`.default(false)` で
    // 省略時 false（未更新フォームも後方互換で通る。bookmarkedOnly と同じ流儀）。
    orderByOccurrenceNumber: z.boolean().default(false),
  })
  .superRefine(checkQuizRangeCrossField);

/** `submitQuizAnswers` の入力。テストは常に 1 問以上のため空の answers は不正とする。 */
export const submitQuizAnswersInputSchema = z.object({
  format: quizFormatSchema,
  answers: z.array(answerInputSchema).min(1).max(QUIZ_ANSWERS_MAX_COUNT),
});

/** `getWordDetailForDialog` の入力（wordId 単体）。 */
export const wordIdSchema = idInputSchema;

/** `getAdjacentWordsForDialog` の入力（掲載箇所内の前後単語取得）。 */
export const adjacentWordsInputSchema = z.object({
  occurrenceId: idInputSchema,
  wordId: idInputSchema,
});

export type AdjacentWordsInput = z.infer<typeof adjacentWordsInputSchema>;

/**
 * `saveQuizDefaults` の入力（開始画面デフォルト設定）。
 * 全項目 nullable: Occurrence 削除（DB の SetNull）で「format だけ残る」状態が必ず
 * 生じるため、部分的なデフォルトをフォームでも表現・保存できるようにする。
 * rangeFrom > rangeTo は quizRangeInputSchema と同方針で拒否しない。
 */
export const saveQuizDefaultsInputSchema = z.object({
  occurrenceId: idInputSchema.nullable(),
  rangeFrom: z.number().int().positive().nullable(),
  rangeTo: z.number().int().positive().nullable(),
  // 「ブックマークのみ」絞り込みのデフォルト。null = アプリ既定 OFF（既存の nullable Boolean 項目と同じ流儀。決定 6）。
  // `.default(null)` で省略時は null（09 未実装の設定フォームが bookmarkedOnly を送らない後方互換）。
  bookmarkedOnly: z.boolean().nullable().default(null),
  format: quizFormatSchema.nullable(),
  timeoutByFormat: quizTimeoutByFormatSchema,
  showCountdown: z.boolean().nullable(),
  autoplayPronunciation: z.boolean().nullable(),
  enableAnswerSound: z.boolean().nullable(),
  autoplayAnswerAudioJaEn: z.boolean().nullable(),
  choiceFirstMeaningTextOnly: z.boolean().nullable(),
  // 掲載番号順出題のデフォルト。null = アプリ既定 OFF（＝ランダム）。`.default(null)` で
  // 省略時は null（この項目を送らない旧フォームとの後方互換。bookmarkedOnly と同じ流儀）。
  orderByOccurrenceNumber: z.boolean().nullable().default(null),
  drillIncludeCorrect: z.boolean().nullable(),
  // 定着までの回数（残数設定）。null = アプリ既定（誤答3 / うろ覚え2 / 正答1）。
  resetRemaining: quizRemainingCountSchema.nullable(),
  vagueRemaining: quizRemainingCountSchema.nullable(),
  initialCorrectRemaining: quizRemainingCountSchema.nullable(),
  saveOnStart: z.boolean().nullable(),
});

// ---- drill 系 Server Action の入力スキーマ ----

/** 元テスト 1 問分の結果（`startDrill` の results 要素。docs/adr/0017-server-actions-over-route-handlers.md）。
 *  result から投入要否（CORRECT のみトグル依存）と初期残数（Drill の残数設定由来）を導出する。 */
export const drillResultInputSchema = z.object({
  wordId: idInputSchema,
  result: quizResultSchema,
}) satisfies z.ZodType<DrillResultInput>;

/**
 * `startDrill` の入力。format / timeoutSeconds はここで 1 回だけ受け取り
 * `Drill` に保存して全ラウンドで引き継ぐ（docs/adr/0038-drill-inherits-format-timeout.md）。
 * テストは常に 1 問以上のため空の results は不正とする。
 */
export const startDrillInputSchema = z.object({
  // 掲載箇所なし（ブックマーク全件モードの元テスト由来）では省略 = null で Drill を作る。
  occurrenceId: idInputSchema.optional(),
  // 元テストの範囲（省略 = 範囲指定なし）。完了画面の「同じ範囲でもう一度テストする」用に
  // `Drill` へ保存する（実効範囲 rangeFrom/rangeTo とは別物）。
  sourceRangeFrom: z.number().int().positive().optional(),
  sourceRangeTo: z.number().int().positive().optional(),
  // 元テストの「ブックマークのみ」指定（省略時 false）。`Drill.sourceBookmarkedOnly` に保存し、
  // 再テスト開始時に今のブックマーク集合で再評価する（決定 5）。
  sourceBookmarkedOnly: z.boolean().default(false),
  format: quizFormatSchema,
  timeoutSeconds: quizTimeoutSecondsSchema.nullable(),
  choiceFirstMeaningTextOnly: z.boolean(),
  // 元テストの「掲載番号順に出題する」指定。`Drill` に保存し全ラウンド・再テストへ引き継ぐ
  // （docs/adr/0072-quiz-order-by-occurrence-number.md）。省略時 false（後方互換）。
  orderByOccurrenceNumber: z.boolean().default(false),
  // テスト結果画面で解決済みのトグル値。false（既定）= 誤答のみ、true = 正答も出題。
  drillIncludeCorrect: z.boolean(),
  // 定着までの回数（残数設定）。テスト開始時の値をそのまま受け取り `Drill` 行へ保存する。
  resetRemaining: quizRemainingCountSchema,
  vagueRemaining: quizRemainingCountSchema,
  initialCorrectRemaining: quizRemainingCountSchema,
  results: z.array(drillResultInputSchema).min(1).max(QUIZ_ANSWERS_MAX_COUNT),
});

/** `startDrillRound` の入力（初回・再開とも同一経路。形式は `Drill.format` から導出）。 */
export const startDrillRoundInputSchema = z.object({
  drillId: idInputSchema,
});

/**
 * `submitDrillRound` の入力。expectedRoundCount は `startDrillRound` 応答の
 * roundCount をそのまま返す（CAS 冪等の期待値。docs/adr/0033-drill-round-count-cas.md）。
 */
export const submitDrillRoundInputSchema = z.object({
  drillId: idInputSchema,
  expectedRoundCount: z.number().int().nonnegative(),
  answers: z.array(answerInputSchema).min(1).max(QUIZ_ANSWERS_MAX_COUNT),
}) satisfies z.ZodType<DrillRoundInput>;

/** `deleteDrill` の入力。 */
export const deleteDrillInputSchema = z.object({
  drillId: idInputSchema,
});

/**
 * `startDrillRetry` の入力（docs/adr/0041-drill-retry.md）。wordIds は直前ラウンドの出題単語の
 * クライアント申告（サーバーにラウンドのメンバーシップがなく導出不可。`startDrill` の
 * results と同じ信頼モデル）。当該 drill の DrillWord との交差はサーバーで検証する。
 */
export const startDrillRetryInputSchema = z.object({
  drillId: idInputSchema,
  wordIds: z.array(idInputSchema).min(1).max(QUIZ_ANSWERS_MAX_COUNT),
});

/** `submitDrillRetry` の入力。format は `Drill.format` から導出するため受け取らない。 */
export const submitDrillRetryInputSchema = z.object({
  drillId: idInputSchema,
  answers: z.array(answerInputSchema).min(1).max(QUIZ_ANSWERS_MAX_COUNT),
});

// bookmarkedOnly / sourceBookmarkedOnly / orderByOccurrenceNumber は `.default(false)` のため、パース後（z.infer）の型では必須になる。
// action 呼び出し元（start-form / quiz-flow）はこれらを未指定のまま送る後方互換があるため、
// 呼び出し元が満たす「パース前」の入力型（z.input）を公開する（省略時 false は zod 側の default が補う）。
export type StartQuizInput = z.input<typeof startQuizInputSchema>;
// bookmarkedOnly は `.default(null)`。設定フォーム（09 未実装）が未指定で送る後方互換のため入力型を公開する。
export type SaveQuizDefaultsInput = z.input<typeof saveQuizDefaultsInputSchema>;
export type SubmitQuizAnswersInput = z.infer<typeof submitQuizAnswersInputSchema>;
export type StartDrillInput = z.input<typeof startDrillInputSchema>;
export type StartDrillRoundInput = z.infer<typeof startDrillRoundInputSchema>;
export type SubmitDrillRoundInput = z.infer<typeof submitDrillRoundInputSchema>;
export type DeleteDrillInput = z.infer<typeof deleteDrillInputSchema>;
export type StartDrillRetryInput = z.infer<typeof startDrillRetryInputSchema>;
export type SubmitDrillRetryInput = z.infer<typeof submitDrillRetryInputSchema>;
