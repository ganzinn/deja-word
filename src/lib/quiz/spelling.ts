// スペル確認（SPELLING）の自動採点ロジック。
// クライアント（question-spelling）から import するため `server-only` は付けない。

/** スペル照合の正規化: 前後空白を無視し、大文字小文字を区別しない。 */
export function normalizeSpelling(value: string): string {
  return value.trim().toLowerCase();
}

/** 入力したスペルが headword と一致するか（前後空白・大文字小文字を無視）。 */
export function isSpellingCorrect(input: string, headword: string): boolean {
  return normalizeSpelling(input) === normalizeSpelling(headword);
}
