// 訳語（MeaningText）の描画。単語詳細・単語一覧・単語テスト（問題文・選択肢・結果）で共用する。
//
// 既定のベース体裁は共通ルールの斜体（`do` / `doing`）だけ。色も `A` / `B` の斜体も付けない
// （どちらも TG 例文限定 → placeholder-text）。訳語全体に色などを載せたい呼び出し側は
// `baseClassName` で追加できる（ユーザーの装飾記法が後勝ちする）。
//
// ラッパー要素は作らず断片を返すので、`whitespace-pre-wrap` などの体裁は
// 呼び出し側の親要素に付けたままでよい（RichText と同じ使い勝手）。

import { Fragment } from "react";

import { ITALIC_PLACEHOLDER_SOURCE, renderPlaceholders } from "@/components/placeholder-text";

const MEANING_TEXT_PATTERN = new RegExp(ITALIC_PLACEHOLDER_SOURCE, "g");

/** 訳語。do / doing = 斜体、装飾記法は解釈して描画する。 */
export function MeaningText({ text, baseClassName }: { text: string; baseClassName?: string }) {
  return <>{renderPlaceholders(text, MEANING_TEXT_PATTERN, () => "italic", baseClassName)}</>;
}

/**
 * 同じ Meaning の訳語の並び。「; 」でつないで 1 行に出す。
 * `emphasizeFirst` は「先頭の訳語がメインの訳語」という印の赤字（ADR-0103）で、
 * 全訳語を見せている表示だけが true にする（先頭 1 つに絞った表示では自明なため付けない）。
 * 赤字はベース体裁として載せるので、ユーザーの装飾記法が後勝ちする（ADR-0077）。
 */
export function MeaningTextList({
  texts,
  emphasizeFirst,
}: {
  texts: string[];
  emphasizeFirst: boolean;
}) {
  return (
    <>
      {texts.map((text, i) => (
        <Fragment key={i}>
          {i > 0 ? "; " : null}
          <MeaningText
            text={text}
            baseClassName={emphasizeFirst && i === 0 ? "text-red-500" : undefined}
          />
        </Fragment>
      ))}
    </>
  );
}
