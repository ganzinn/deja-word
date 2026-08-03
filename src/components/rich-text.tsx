// 単語コンテンツの装飾記法（`**太字**` `*斜体*` `==赤==` `__青下線__`）の描画。
// 記法の解釈は `@/lib/rich-text`、体裁（Tailwind クラス）はここに集約する。
// フックなしの純描画のためサーバー/クライアント両用（tg-example-text と同じ方針）。

import { parseRichText, type RichTextMark } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

const MARK_CLASS_NAMES: Record<RichTextMark, string> = {
  bold: "font-bold",
  italic: "italic",
  red: "text-red-500",
  // 「青下線」は色と下線をセットで表す 1 つの装飾（記法も __…__ の 1 種類）。
  underline: "text-blue-500 underline underline-offset-2",
};

/**
 * マーク集合に対応するクラス名。TG 例文のハイライトと重ねる際は
 * **ベース側の後ろに置く**（tailwind-merge が後勝ちで解決するため、ユーザー記法が優先される）。
 */
export function richTextMarkClassName(marks: readonly RichTextMark[]): string {
  return marks.map((m) => MARK_CLASS_NAMES[m]).join(" ");
}

/**
 * 装飾記法を解釈して描画する。ラッパー要素は作らず断片を返すので、
 * `whitespace-pre-wrap` などの体裁は呼び出し側の親要素に付けたままでよい。
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((segment, index) =>
        segment.marks.length === 0 ? (
          segment.text
        ) : (
          <span key={index} className={cn(richTextMarkClassName(segment.marks))}>
            {segment.text}
          </span>
        ),
      )}
    </>
  );
}
