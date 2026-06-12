import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";

export type QuizErrorCode = "not_found" | "generation_failed" | "unknown";

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
 * - 未知のエラー: `words/error-map.ts` と同じ方針で `unknown` にマップ（ログのみ残す）
 */
export function mapQuizErrorToResult(e: unknown): QuizErrorResult {
  if (e instanceof OccurrenceNotFoundError) {
    return { ok: false, error: "not_found", message: "対象の掲載箇所が見つかりません。" };
  }
  if (e instanceof QuizGenerationError) {
    return { ok: false, error: "generation_failed", message: e.message };
  }
  console.error("[quiz] action failed", e);
  return {
    ok: false,
    error: "unknown",
    message: "処理に失敗しました。しばらくしてから再度お試しください。",
  };
}
