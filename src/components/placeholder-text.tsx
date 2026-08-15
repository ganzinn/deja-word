// 単語コンテンツ本文中のプレースホルダ記号（A / B / do / doing / 〜 / 括弧 / 省略記号）の描画。
//
// `do` / `doing` の斜体は欄ごとに決めず**全欄共通**にする（TG 例文の英文・和訳・訳語）。
// 欄固有なのは色（青）・非太字・`A` / `B` の斜体で、いずれも TG 例文のベース体裁に限る
// （docs/adr/0083-placeholder-italic-shared.md）。
//
// 自動の体裁はベース、ユーザーが入力した装飾記法（`**太字**` 等）はその上に重ねる。
// 競合するプロパティは cn（tailwind-merge）の後勝ちでユーザー記法が優先される
// （docs/adr/0077-rich-text-markup.md）。フックなしの純描画のためサーバー/クライアント両用。

import { richTextMarkClassName } from "@/components/rich-text";
import { parseRichText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/**
 * 全欄で斜体にするプレースホルダ（語法の骨組みを表す記号）。パターン片として各欄の正規表現に埋め込む。
 * 長い方から並べる（`doing` を `do` に食わせない）。`A` / `B` は TG 例文の英文だけの体裁なので含めない。
 */
export const ITALIC_PLACEHOLDER_SOURCE = String.raw`\bdoing\b|\bdo\b`;

const ITALIC_PLACEHOLDER_TOKEN = new RegExp(`^(?:${ITALIC_PLACEHOLDER_SOURCE})$`);

/** 切り出したトークンが斜体対象か。対象集合は ITALIC_PLACEHOLDER_SOURCE と同一。 */
export function isItalicPlaceholder(token: string): boolean {
  return ITALIC_PLACEHOLDER_TOKEN.test(token);
}

/** ベース → プレースホルダ体裁 → ユーザー記法の順に合成する（tailwind-merge の後勝ちで記法が優先）。 */
export function composeSegmentClassName(
  baseClassName: string | undefined,
  tokenClassName: string | null,
  markClassName: string,
): string {
  return cn(baseClassName, tokenClassName, markClassName);
}

/**
 * 装飾記法を解いたうえで、各セグメント内のプレースホルダ記号だけ体裁を変えて返す。
 * pattern は global フラグ必須。classFor が空文字を返したトークンは素のまま出す。
 */
export function renderPlaceholders(
  text: string,
  pattern: RegExp,
  classFor: (token: string) => string,
  /** セグメント全体（プレースホルダ以外も含む）に当てるベース体裁。ユーザー記法が後勝ちする。 */
  baseClassName?: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  parseRichText(text).forEach((segment, segmentIndex) => {
    const markClassName = richTextMarkClassName(segment.marks);
    const push = (chunk: string, tokenClassName: string | null, key: string) => {
      if (chunk.length === 0) return;
      const className = composeSegmentClassName(baseClassName, tokenClassName, markClassName);
      nodes.push(
        className.length === 0 ? (
          chunk
        ) : (
          <span key={key} className={className}>
            {chunk}
          </span>
        ),
      );
    };

    let last = 0;
    for (const m of segment.text.matchAll(pattern)) {
      const token = m[0];
      const start = m.index ?? 0;
      push(segment.text.slice(last, start), null, `${segmentIndex}-p${last}`);
      push(token, classFor(token), `${segmentIndex}-t${start}`);
      last = start + token.length;
    }
    push(segment.text.slice(last), null, `${segmentIndex}-p${last}`);
  });
  return nodes;
}
