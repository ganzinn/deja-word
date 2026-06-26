// 定着モード（drill）の「定着までの回数」（残数）の共有定数。
// zod スキーマ・テスト結果画面（result-list）・テストフロー（quiz-flow）・
// デフォルト設定画面（quiz-defaults-form）・残数遷移ロジック（next-remaining）で共用する。
// server-only にしない（client / zod 共用のため）。

/** 設定できる回数の下限。 */
export const REMAINING_MIN_COUNT = 1;

/** 設定できる回数の上限。 */
export const REMAINING_MAX_COUNT = 9;

/** 誤答（GAVE_UP / TIMEOUT 含む）のリセット値の既定（＝「定着までの回数」の本体）。 */
export const DEFAULT_RESET_REMAINING = 3;

/** うろ覚え（VAGUE）のリセット値の既定（正解と不正解の中間）。 */
export const DEFAULT_VAGUE_REMAINING = 2;

/** テスト正答組の drill 投入初期値の既定（1 回正解すれば定着）。 */
export const DEFAULT_INITIAL_CORRECT_REMAINING = 1;

/**
 * 入力文字列から「定着までの回数」の有効値（1..9 の整数）を返す。
 * 空欄・非整数・範囲外は undefined（＝未確定として開始をゲートする）。
 * テスト結果画面（result-list）の入力検証と drill 開始時の解決（quiz-flow）で共用する。
 */
export function parseRemainingCount(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number.parseInt(trimmed, 10);
  if (Number.isNaN(n) || n < REMAINING_MIN_COUNT || n > REMAINING_MAX_COUNT) return undefined;
  return n;
}
