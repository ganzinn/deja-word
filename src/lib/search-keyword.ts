// 単語検索のキーワード正規化。server / client 双方から使えるよう `server-only` は付けない。

/** 結合文字（アクセント記号などのダイアクリティカルマーク）。NFD 分解後に現れる。 */
const COMBINING_MARK_PATTERN = /\p{M}/gu;

/**
 * 単語検索のキーワードを正規化する。
 * 見出し語（headword）はアクセント記号を持たないのに対し、関連語の見出し（term）は
 * `péssimist` のようにアクセント記号付きで登録されている。関連語から既存単語を探すとき
 * term をそのまま検索語にしても一致しないため、キーワード側のアクセント記号を落として揃える。
 *
 * NFD で分解してから結合文字を除くので、合成済み（`é`）・分解済み（`e` + `́`）のどちらの
 * 入力でも同じ結果になる。分解できない文字（`ø` 等）はそのまま残る。
 */
export function normalizeSearchKeyword(raw: string): string {
  return raw.normalize("NFD").replace(COMBINING_MARK_PATTERN, "").trim();
}
