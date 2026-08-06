// TG 例文（Example.kind=TARGET）のハイライト描画。
// 単語詳細（word-detail-view）とクイズのTG四択（問題文・選択肢）で共用し、
// プレースホルダ記号の体裁のドリフトを防ぐ。フックなしの純描画のためサーバー/クライアント両用。
//
// ここに書くのは TG 固有の体裁だけ（色・非太字・英文だけの A/B の斜体）。`do` / `doing` の斜体は
// 訳語と共通で placeholder-text が持つ。

import {
  ITALIC_PLACEHOLDER_SOURCE,
  isItalicPlaceholder,
  renderPlaceholders,
} from "@/components/placeholder-text";
import { cn } from "@/lib/utils";

// A / B。英文では斜体にするが、和訳では色を変えるだけで斜体にしない（英文＝語法の骨組み、
// 和訳＝日本語の中の記号、という読ませ方の違い）。
const AB_SOURCE = String.raw`\bA\b|\bB\b`;
const isAb = (token: string) => token === "A" || token === "B";

// TG 例文の英文（ベース = 青太字）で体裁を変えるプレースホルダ記号。
// A/B/do/doing は非太字＋斜体、括弧・チルダは非太字。
// 括弧は読み上げ側（speech.ts の toSpokenText）と対象字形を揃えるため半角・全角の両方を見る。
const TG_TEXT_PATTERN = new RegExp(
  `${ITALIC_PLACEHOLDER_SOURCE}|${AB_SOURCE}|[[\\]()（）［］〜]`,
  "g",
);
const tgTextClass = (token: string) =>
  cn("font-normal", (isItalicPlaceholder(token) || isAb(token)) && "italic");

// TG 例文の意味（ベース = 赤）で体裁を変えるプレースホルダ記号。
// 青にするのは ... / A / B / 〜、斜体にするのは do/doing（色は変えない）。
const TG_MEANING_PATTERN = new RegExp(
  `\\.\\.\\.|${ITALIC_PLACEHOLDER_SOURCE}|${AB_SOURCE}|〜`,
  "g",
);
const isTgMeaningBlue = (token: string) => isAb(token) || token === "..." || token === "〜";
const tgMeaningClass = (token: string) =>
  cn(isItalicPlaceholder(token) && "italic", isTgMeaningBlue(token) && "text-blue-500");

/** TG 例文の英文。ベース = 青太字、A/B/do/doing = 非太字斜体、括弧・〜 = 非太字。 */
export function TgExampleText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("font-bold whitespace-pre-wrap text-blue-500", className)}>
      {renderPlaceholders(text, TG_TEXT_PATTERN, tgTextClass)}
    </span>
  );
}

/** TG 例文の意味。ベース = 赤、プレースホルダ（... / A / B / 〜）= 青、do/doing = 斜体。 */
export function TgExampleMeaning({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("whitespace-pre-wrap text-red-500", className)}>
      {renderPlaceholders(text, TG_MEANING_PATTERN, tgMeaningClass)}
    </span>
  );
}
