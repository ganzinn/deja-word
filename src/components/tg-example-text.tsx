// TG 例文（Example.kind=TARGET）のハイライト描画。
// 単語詳細（word-detail-view）とクイズの例文四択（問題文・選択肢）で共用し、
// プレースホルダ記号の体裁のドリフトを防ぐ。フックなしの純描画のためサーバー/クライアント両用。

import { cn } from "@/lib/utils";

// テキストを正規表現で分割し、一致部分だけを span で包んで返す。pattern は global フラグ必須。
function renderHighlighted(
  text: string,
  pattern: RegExp,
  classFor: (token: string) => string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const token = m[0];
    const start = m.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <span key={start} className={classFor(token)}>
        {token}
      </span>,
    );
    last = start + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// TG 例文の英文（ベース = 青太字）で体裁を変えるプレースホルダ記号。
// A/B/do/doing は非太字＋斜体、括弧・チルダは非太字。
const TG_TEXT_PATTERN = /\bdoing\b|\bdo\b|\bA\b|\bB\b|[[\]()〜]/g;
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
