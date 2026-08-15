import type { QuizPayload } from "@/lib/quiz/payload";
import type { StartDrillInput, StartQuizInput } from "@/lib/schema/quiz";

/**
 * テスト結果画面の「定着モードをはじめる」が送る `startDrill` 入力の組み立て。
 * 元テストの開始入力（範囲・ブックマーク絞り込み・出題設定）を Drill へ引き継ぐ配線が
 * ここに集約される。引き継ぎ漏れはスキーマの `.default()` に吸収されて型では検出できない
 * （issue #144: `sourceBookmarkedOnly` の渡し忘れ）ため、純関数に切り出して回帰テストで覆う。
 */
export function buildStartDrillInput(params: {
  /** 元テストの開始入力（掲載箇所・範囲・ブックマークのみ・出題設定）。 */
  startInput: StartQuizInput;
  /** 元テストの payload（形式・制限時間の確定値を持つ）。 */
  quiz: Pick<QuizPayload, "format" | "timeoutSeconds">;
  /** 結果画面トグル: false（既定）= 誤答のみ、true で正答も出題。 */
  drillIncludeCorrect: boolean;
  /** 結果画面で解決済みの「定着までの回数」（残数設定。1..9）。 */
  resetRemaining: number;
  vagueRemaining: number;
  initialCorrectRemaining: number;
  /** テスト全問の結果（投入要否と初期残数は drill-create が導出する）。 */
  results: StartDrillInput["results"];
}): StartDrillInput {
  const { startInput, quiz } = params;
  return {
    occurrenceId: startInput.occurrenceId,
    // 元テストの範囲を Drill に保存する（完了画面の「同じ範囲でもう一度テストする」用）
    sourceRangeFrom: startInput.rangeFrom,
    sourceRangeTo: startInput.rangeTo,
    // 元テストの「ブックマークのみ」指定も Drill に保存し、再テスト導線で今のブックマーク
    // 集合を再評価する（ADR-0070 決定 5）。進行中一覧の「（ブックマークのみ）」注記もこの値
    sourceBookmarkedOnly: startInput.bookmarkedOnly,
    // 元テストの出題数指定も Drill に保存する。再テストは同じ出題数で範囲から再抽選する
    // （docs/adr/0074-quiz-question-count-sampling.md）
    sourceQuestionCount: startInput.questionCount,
    format: quiz.format,
    // 元テストの制限時間を Drill に保存し、全ラウンドで引き継ぐ
    timeoutSeconds: quiz.timeoutSeconds,
    // 元テストの「先頭の訳語のみ表示」設定も Drill に保存して引き継ぐ
    firstMeaningTextOnly: startInput.firstMeaningTextOnly,
    // 元テストの「掲載番号順に出題する」設定も Drill に保存し、全ラウンド・再テストで引き継ぐ
    // （掲載番号順の drill はラウンドごとの再シャッフルをしない。ADR-0072）
    orderByOccurrenceNumber: startInput.orderByOccurrenceNumber,
    drillIncludeCorrect: params.drillIncludeCorrect,
    // 結果画面で設定した定着までの回数（残数設定）を Drill に保存し、生成・全ラウンドで引き継ぐ
    resetRemaining: params.resetRemaining,
    vagueRemaining: params.vagueRemaining,
    initialCorrectRemaining: params.initialCorrectRemaining,
    results: params.results,
  };
}
