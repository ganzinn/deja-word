import { EmptyDrillResultsError } from "@/lib/drill-create";
import { EmptyDrillRetryError } from "@/lib/drill-retry-generate";
import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import {
  DrillNotFoundError,
  DrillRoundConflictError,
} from "@/lib/quiz/handlers/drill-round-handler";

export type QuizErrorCode = "not_found" | "generation_failed" | "conflict" | "unknown";

export type QuizErrorResult = {
  ok: false;
  error: QuizErrorCode;
  message: string;
};

/**
 * quiz 系 UseCase が投げるエラーを Result 型へ統一マップする
 * （05-architecture.md 決定 1。`words/error-map.ts` と同形）。
 *
 * - `OccurrenceNotFoundError`: 対象 Occurrence が不在・不可視（`fetchQuizSource` 由来）
 * - `QuizGenerationError`: 形式不成立等で問題生成できない（message はユーザー提示可能な日本語）
 * - `DrillNotFoundError`: drill が不在・不可視（存在を漏らさない）
 * - `EmptyDrillResultsError`: drill 生成の results に有効な単語が 1 件もない
 *   （改ざん入力・極端な削除レースのみ到達。バグではないためログは残さず not_found 扱い）
 * - `EmptyDrillRetryError`: 再テスト生成の wordIds に当該 drill の単語が 1 件もない（同上の扱い）
 * - `DrillRoundConflictError`: ラウンド送信の競合（別画面で 2 ラウンド以上進んでいる等）
 * - 未知のエラー: `words/error-map.ts` と同じ方針で `unknown` にマップ（ログのみ残す）
 */
export function mapQuizErrorToResult(e: unknown): QuizErrorResult {
  if (e instanceof OccurrenceNotFoundError) {
    return { ok: false, error: "not_found", message: "対象の掲載箇所が見つかりません。" };
  }
  if (e instanceof QuizGenerationError) {
    return { ok: false, error: "generation_failed", message: e.message };
  }
  if (e instanceof DrillNotFoundError) {
    return { ok: false, error: "not_found", message: "対象の定着モードが見つかりません。" };
  }
  if (e instanceof EmptyDrillResultsError) {
    return {
      ok: false,
      error: "not_found",
      message: "定着モードの対象になる単語が見つかりません。",
    };
  }
  if (e instanceof EmptyDrillRetryError) {
    return {
      ok: false,
      error: "not_found",
      message: "再テストの対象になる単語が見つかりません。",
    };
  }
  if (e instanceof DrillRoundConflictError) {
    return {
      ok: false,
      error: "conflict",
      message: "定着モードが別の画面で先に進んでいるため、この結果は送信できません。",
    };
  }
  console.error("[quiz] action failed", e);
  return {
    ok: false,
    error: "unknown",
    message: "処理に失敗しました。しばらくしてから再度お試しください。",
  };
}
