"use client";

import { RichText } from "@/components/rich-text";
import { Badge } from "@/components/ui/badge";
import { commonPartOfSpeechFullLabel } from "@/lib/mock/parts-of-speech";
import type { MeaningDisplay } from "@/lib/quiz/payload";

/**
 * 全 Meaning（品詞バッジ＋テキスト）の表示ブロック。
 * 自己判定（英語→日本語）の解答表示と、日本語→英語の問題文（意味の提示）で共用する。
 */
export function MeaningBlocks({ meanings }: { meanings: MeaningDisplay[] }) {
  return (
    <div className="flex w-full flex-col gap-3">
      {meanings.map((meaning, index) => (
        <div
          key={index}
          className="border-border bg-card/50 font-content flex flex-col gap-2 rounded-lg border p-3"
        >
          {meaning.partOfSpeech ? (
            <div>
              <Badge variant="outline">{commonPartOfSpeechFullLabel(meaning.partOfSpeech)}</Badge>
            </div>
          ) : null}
          {meaning.texts.length === 1 ? (
            <p className="text-sm whitespace-pre-wrap">
              <RichText text={meaning.texts[0]} />
            </p>
          ) : (
            <ul className="ml-4 list-disc text-sm">
              {meaning.texts.map((text, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  <RichText text={text} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
