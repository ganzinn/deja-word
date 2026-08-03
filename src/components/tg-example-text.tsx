// TG 例文（Example.kind=TARGET）のハイライト描画。
// 単語詳細（word-detail-view）とクイズのTG四択（問題文・選択肢）で共用し、
// プレースホルダ記号の体裁のドリフトを防ぐ。フックなしの純描画のためサーバー/クライアント両用。
//
// TG の自動着色（英文=青太字 / 意味=赤 / プレースホルダの体裁）はベースの体裁で、
// ユーザーが入力した装飾記法（`**太字**` 等）はその上に重ねる。競合するプロパティは
// cn（tailwind-merge）の後勝ちでユーザー記法が優先される（docs/adr/0077-rich-text-markup.md）。

import { richTextMarkClassName } from "@/components/rich-text";
import { parseRichText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

// 装飾記法を解いたうえで、各セグメント内のプレースホルダ記号だけ体裁を変えて返す。
// pattern は global フラグ必須。
function renderHighlighted(
  text: string,
  pattern: RegExp,
  classFor: (token: string) => string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  parseRichText(text).forEach((segment, segmentIndex) => {
    const markClassName = richTextMarkClassName(segment.marks);
    const push = (chunk: string, tokenClassName: string | null, key: string) => {
      if (chunk.length === 0) return;
      // ベース（プレースホルダ体裁）→ ユーザー記法の順に合成し、後者を勝たせる
      const className = cn(tokenClassName, markClassName);
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

// TG 例文の英文（ベース = 青太字）で体裁を変えるプレースホルダ記号。
// A/B/do/doing は非太字＋斜体、括弧・チルダは非太字。
// 括弧は読み上げ側（speech.ts の toSpokenText）と対象字形を揃えるため半角・全角の両方を見る。
const TG_TEXT_PATTERN = /\bdoing\b|\bdo\b|\bA\b|\bB\b|[[\]()（）［］〜]/g;
const tgTextClass = (token: string) =>
  /^(?:A|B|do|doing)$/.test(token) ? "font-normal italic" : "font-normal";

// TG 例文の意味（ベース = 赤）で青にするプレースホルダ記号。
const TG_MEANING_PATTERN = /\.\.\.|\bA\b|\bB\b|〜/g;

/** TG 例文の英文。ベース = 青太字、A/B/do/doing = 非太字斜体、括弧・〜 = 非太字。 */
export function TgExampleText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("font-bold whitespace-pre-wrap text-blue-500", className)}>
      {renderHighlighted(text, TG_TEXT_PATTERN, tgTextClass)}
    </span>
  );
}

/** TG 例文の意味。ベース = 赤、プレースホルダ（... / A / B / 〜）= 青。 */
export function TgExampleMeaning({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("whitespace-pre-wrap text-red-500", className)}>
      {renderHighlighted(text, TG_MEANING_PATTERN, () => "text-blue-500")}
    </span>
  );
}
