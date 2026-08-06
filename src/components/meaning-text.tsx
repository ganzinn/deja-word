// 訳語（MeaningText）の描画。単語詳細・単語一覧・単語テスト（問題文・選択肢・結果）で共用する。
//
// ベースの体裁は共通ルールの斜体（`do` / `doing`）だけ。色も `A` / `B` の斜体も付けない
// （どちらも TG 例文限定 → placeholder-text）。
//
// ラッパー要素は作らず断片を返すので、`whitespace-pre-wrap` などの体裁は
// 呼び出し側の親要素に付けたままでよい（RichText と同じ使い勝手）。

import { ITALIC_PLACEHOLDER_SOURCE, renderPlaceholders } from "@/components/placeholder-text";

const MEANING_TEXT_PATTERN = new RegExp(ITALIC_PLACEHOLDER_SOURCE, "g");

/** 訳語。do / doing = 斜体、装飾記法は解釈して描画する。 */
export function MeaningText({ text }: { text: string }) {
  return <>{renderPlaceholders(text, MEANING_TEXT_PATTERN, () => "italic")}</>;
}
