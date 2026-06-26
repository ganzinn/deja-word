// 定着モード（drill）の「定着までの回数」（残数）の共有定数。
// zod スキーマ・開始画面（start-form）・デフォルト設定画面（quiz-defaults-form）・
// 残数遷移ロジック（next-remaining）で共用する。server-only にしない（client / zod 共用のため）。

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
