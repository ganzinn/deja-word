// 制限時間（1 問あたりのタイムアウト）の共有定数。
// zod スキーマ・開始画面（start-form）・デフォルト設定画面（quiz-defaults-form）で共用する。

/** 制限時間の下限（秒）。 */
export const TIMEOUT_MIN_SECONDS = 1;

/** 制限時間の上限（秒）。1 問あたりの回答時間として実用的な範囲に制限する。 */
export const TIMEOUT_MAX_SECONDS = 60;

/** 制限時間を ON にしたときの初期値（秒）。 */
export const DEFAULT_TIMEOUT_SECONDS = 5;

/** 制限時間を表示用ラベルに変換する（null＝制限なし）。 */
export function formatTimeoutLabel(seconds: number | null): string {
  return seconds == null ? "制限なし" : `制限 ${seconds} 秒`;
}
