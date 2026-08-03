"use client";

// 文章系の入力欄で使える装飾記法の凡例（折りたたみ）。
// 記法そのものは手打ちのため、記号と表示結果の対応をフォーム上で確認できるようにする。
// 表示側の見本は RichText を通して描画し、凡例と実際の体裁がドリフトしないようにする。

import { ChevronDownIcon } from "lucide-react";

import { RichText } from "@/components/rich-text";

const EXAMPLES = ["**太字**", "*斜体*", "***太字の斜体***", "==赤文字==", "__青の下線__"];

export function RichTextHelp() {
  return (
    <details className="group border-border bg-card/50 mx-4 mt-4 rounded-lg border">
      <summary className="text-muted-foreground flex cursor-pointer list-none items-center gap-1.5 p-3 text-sm">
        <ChevronDownIcon className="size-4 shrink-0 transition-transform group-open:rotate-180" />
        文字を装飾するには
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <ul className="flex flex-col gap-1 text-sm">
          {EXAMPLES.map((example) => (
            <li key={example} className="flex items-center gap-2">
              <code className="text-muted-foreground shrink-0 font-mono text-xs">{example}</code>
              <span className="text-muted-foreground shrink-0 text-xs">→</span>
              <RichText text={example} />
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          <code className="font-mono">**==赤い太字==**</code>{" "}
          のように重ねられます。意味・補足説明・例文とその和訳・関連語の意味・メモ・掲載箇所の詳細で使えます。見出し語・関連語の見出し・発音記号・掲載箇所名では記号がそのまま表示されます。
        </p>
      </div>
    </details>
  );
}
