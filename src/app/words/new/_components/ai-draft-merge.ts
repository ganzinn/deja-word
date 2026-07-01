import type { WordAiDraft, WordAiSections } from "@/lib/schema/word-ai-draft";
import type { ExampleValue, MeaningValue, WordFormValues } from "@/lib/schema/word-form";

// フォームの入力状況から生成が必要なセクションを算出する。
// 「1 件でも入力済みの行があるセクションは生成しない」— AI は頻出順の内容を返すため、
// 入力済みの行と類似した内容になりがちで、生成トークンの無駄にもなる。
// 空カード（全フィールド空白）は入力済みに数えない。examples は kind 単位で判定し、
// TARGET / MINIMAL の行は判定に関与しない。全 false のときは呼び出し側が
// AI 呼び出し自体をスキップする。
export function computeAiDraftSections(current: WordFormValues): WordAiSections {
  return {
    meanings: !current.meanings.some(meaningHasContent),
    phrases: !current.examples.some((e) => e.kind === "PHRASE" && exampleHasContent(e)),
    sentences: !current.examples.some((e) => e.kind === "SENTENCE" && exampleHasContent(e)),
  };
}

// AI 下書きをフォーム値へ「空欄のみ埋める・行は追記」でマージする。
// 原則: 非空値は一切上書きしない。「完全に空 かつ id なし（未保存）」のカードだけ
// draft で先頭から順に置換し、残りは末尾に追記する。部分入力済みカードは
// draft との対応関係が不定で誤マージのリスクがあるため触らない。
// 編集モードの既存行は必ず id を持つので置換対象にならず、自然に追記のみになる。
export function mergeAiDraftIntoFormValues(
  current: WordFormValues,
  draft: WordAiDraft,
): WordFormValues {
  return {
    ...current,
    meanings: mergeMeanings(current.meanings, draft.meanings),
    examples: mergeExamples(current.examples, draft),
  };
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function meaningHasContent(m: MeaningValue): boolean {
  return (
    !isBlank(m.partOfSpeech) ||
    !isBlank(m.pronunciation) ||
    m.texts.some((t) => !isBlank(t.text)) ||
    m.notes.some((n) => !isBlank(n.text))
  );
}

function exampleHasContent(e: ExampleValue): boolean {
  return !isBlank(e.text) || !isBlank(e.meaning) || e.notes.some((n) => !isBlank(n.text));
}

function isEmptyMeaning(m: MeaningValue): boolean {
  return !m.id && !meaningHasContent(m);
}

function isEmptyExample(e: ExampleValue): boolean {
  return !e.id && !exampleHasContent(e);
}

function mergeMeanings(
  current: MeaningValue[],
  draftMeanings: WordAiDraft["meanings"],
): MeaningValue[] {
  // 再押下対策: draft の訳語すべてが既存の訳語に含まれる意味は追加しない。
  const existingTexts = new Set(
    current.flatMap((m) => m.texts.map((t) => t.text.trim()).filter((t) => t.length > 0)),
  );
  const additions = draftMeanings
    .filter((d) => !d.texts.every((t) => existingTexts.has(t.trim())))
    .map(
      (d): MeaningValue => ({
        partOfSpeech: d.partOfSpeech,
        pronunciation: d.pronunciation,
        texts: d.texts.map((text) => ({ text })),
        notes: [{ text: "" }],
      }),
    );
  return fillEmptyThenAppend(current, additions, isEmptyMeaning);
}

function mergeExamples(current: ExampleValue[], draft: WordAiDraft): ExampleValue[] {
  // 再押下対策: 本文の trim + 大文字小文字無視の一致で既存行と重なるものは追加しない。
  const seen = new Set(current.map((e) => e.text.trim().toLowerCase()).filter((t) => t.length > 0));
  const additions: ExampleValue[] = [];
  const groups = [
    { kind: "PHRASE", items: draft.phrases },
    { kind: "SENTENCE", items: draft.sentences },
  ] as const;
  for (const { kind, items } of groups) {
    for (const item of items) {
      const key = item.text.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      additions.push({ kind, text: item.text, meaning: item.meaning, notes: [{ text: "" }] });
    }
  }
  return fillEmptyThenAppend(current, additions, isEmptyExample);
}

function fillEmptyThenAppend<T>(current: T[], additions: T[], isEmpty: (row: T) => boolean): T[] {
  const queue = [...additions];
  const filled = current.map((row) => (isEmpty(row) && queue.length > 0 ? queue.shift()! : row));
  return [...filled, ...queue];
}
