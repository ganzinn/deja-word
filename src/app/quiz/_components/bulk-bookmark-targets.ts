import type { ResultRow, SubmitState } from "./result-list";

/**
 * 結果一覧の「間違えた問題だけ表示」チェック ON 時に、一括ブックマークの対象となる wordId 群を返す。
 * 対象 = 誤答行（`result !== "CORRECT"`。表示フィルタと同じ条件）から削除済みを除いたもの。
 * 削除済み判定の源は履歴送信の応答で、行表示側（result-list）の計算と同じ:
 * TEST / DRILL_RETRY（`success`）は `skippedWordIds` に含まれること、DRILL（`drill-success`）は
 * 確定残数 `remaining` に行が無いこと。送信前・失敗（`sending` / `error`）では判定源が無いため
 * 削除済み除外をせず誤答全行を返す（その状態ではボタンが disabled のため押下されない）。
 * 同一単語が複数行に出ることは無い前提のため重複排除はしない。
 */
export function computeBulkBookmarkTargetIds(
  rows: ResultRow[],
  submitState: SubmitState,
): string[] {
  const skippedWordIds =
    submitState.status === "success" ? new Set(submitState.skippedWordIds) : null;
  const remainingByWordId =
    submitState.status === "drill-success"
      ? new Map(submitState.remaining.map((r) => [r.wordId, r.remaining]))
      : null;
  return rows
    .filter((row) => {
      if (row.result === "CORRECT") return false;
      const deleted =
        (skippedWordIds?.has(row.wordId) ?? false) ||
        (remainingByWordId !== null && !remainingByWordId.has(row.wordId));
      return !deleted;
    })
    .map((row) => row.wordId);
}
