"use client";

import { MeaningText } from "@/components/meaning-text";
import { Badge } from "@/components/ui/badge";
import { commonPartOfSpeechFullLabel } from "@/lib/mock/parts-of-speech";
import type { MeaningDisplay } from "@/lib/quiz/payload";

/**
 * 全 Meaning（品詞バッジ＋テキスト）の表示ブロック。
 * 現在の呼び出し元は自己判定（英語→日本語）の解答表示のみ。
 */
export function MeaningBlocks({
  meanings,
  emphasizeFirstText = false,
}: {
  meanings: MeaningDisplay[];
  /** 先頭 Meaning の先頭訳語を赤字で強調する（自己判定（英→日）の解答表示のみ true）。 */
  emphasizeFirstText?: boolean;
}) {
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
              <MeaningText
                text={meaning.texts[0]}
                baseClassName={emphasizeFirstText && index === 0 ? "text-red-500" : undefined}
              />
            </p>
          ) : (
            <ul className="ml-4 list-disc text-sm">
              {meaning.texts.map((text, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  <MeaningText
                    text={text}
                    baseClassName={
                      emphasizeFirstText && index === 0 && i === 0 ? "text-red-500" : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
