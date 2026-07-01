import { describe, expect, test } from "vitest";

import {
  normalizeWordAiDraft,
  WORD_AI_LIMITS,
  wordAiDraftSchemaFor,
  type WordAiDraft,
} from "./word-ai-draft";

function draft(overrides: Partial<WordAiDraft> = {}): WordAiDraft {
  return { meanings: [], phrases: [], sentences: [], ...overrides };
}

describe("wordAiDraftSchemaFor", () => {
  test("要求セクションのキーだけを持ち、非要求キーは strip される", () => {
    const schema = wordAiDraftSchemaFor({ meanings: false, phrases: true, sentences: false });
    const parsed = schema.safeParse({
      phrases: [{ text: "in vain", meaning: "無駄に" }],
      meanings: [{ partOfSpeech: "noun", pronunciation: "", texts: ["訳"] }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ phrases: [{ text: "in vain", meaning: "無駄に" }] });
  });

  test("要求セクションが応答に無ければ検証失敗", () => {
    const schema = wordAiDraftSchemaFor({ meanings: true, phrases: false, sentences: false });
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("normalizeWordAiDraft", () => {
  test("欠けたセクションを [] で補完して完全な WordAiDraft を返す", () => {
    const result = normalizeWordAiDraft({
      sentences: [{ text: "He tried.", meaning: "彼は試した。" }],
    });
    expect(result).toEqual({
      meanings: [],
      phrases: [],
      sentences: [{ text: "He tried.", meaning: "彼は試した。" }],
    });
  });

  test("各フィールドを trim する", () => {
    const result = normalizeWordAiDraft(
      draft({
        meanings: [{ partOfSpeech: " noun ", pronunciation: " ɪˈfemərəl ", texts: [" 儚い "] }],
        phrases: [{ text: " in vain ", meaning: " 無駄に " }],
        sentences: [{ text: " He tried. ", meaning: " 彼は試した。 " }],
      }),
    );
    expect(result.meanings).toEqual([
      { partOfSpeech: "noun", pronunciation: "ɪˈfemərəl", texts: ["儚い"] },
    ]);
    expect(result.phrases).toEqual([{ text: "in vain", meaning: "無駄に" }]);
    expect(result.sentences).toEqual([{ text: "He tried.", meaning: "彼は試した。" }]);
  });

  test("不正な品詞は未選択 ('') に落とす", () => {
    const result = normalizeWordAiDraft(
      draft({ meanings: [{ partOfSpeech: "gerund", pronunciation: "", texts: ["訳"] }] }),
    );
    expect(result.meanings[0].partOfSpeech).toBe("");
  });

  test("空の訳語行を除去し、訳語が全滅した意味は落とす", () => {
    const result = normalizeWordAiDraft(
      draft({
        meanings: [
          { partOfSpeech: "verb", pronunciation: "", texts: ["  ", "走る", ""] },
          { partOfSpeech: "noun", pronunciation: "", texts: ["", "  "] },
        ],
      }),
    );
    expect(result.meanings).toEqual([{ partOfSpeech: "verb", pronunciation: "", texts: ["走る"] }]);
  });

  test("同一の品詞・発音の意味は 1 件に統合され、訳語が出現順で集約される", () => {
    // keen で実際に起きた分割（形容詞 kiːn が 3 カード）の再現
    const result = normalizeWordAiDraft(
      draft({
        meanings: [
          { partOfSpeech: "adjective", pronunciation: "kiːn", texts: ["熱心な", "強い興味をもつ"] },
          { partOfSpeech: "adjective", pronunciation: "kiːn", texts: ["鋭い", "鋭敏な"] },
          { partOfSpeech: "adjective", pronunciation: "kiːn", texts: ["激しい", "強烈な"] },
        ],
      }),
    );
    // 集約後、訳語は textsPerMeaning (3) でキャップされる
    expect(result.meanings).toEqual([
      {
        partOfSpeech: "adjective",
        pronunciation: "kiːn",
        texts: ["熱心な", "強い興味をもつ", "鋭い"],
      },
    ]);
  });

  test("品詞または発音が異なる意味は統合されない", () => {
    const result = normalizeWordAiDraft(
      draft({
        meanings: [
          { partOfSpeech: "verb", pronunciation: "rʌn", texts: ["走る"] },
          { partOfSpeech: "noun", pronunciation: "rʌn", texts: ["ランニング"] },
          { partOfSpeech: "verb", pronunciation: "rʌnz", texts: ["（三単現）走る"] },
        ],
      }),
    );
    expect(result.meanings).toHaveLength(3);
  });

  test("統合時に重複する訳語は除去される", () => {
    const result = normalizeWordAiDraft(
      draft({
        meanings: [
          { partOfSpeech: "adjective", pronunciation: "kiːn", texts: ["鋭い", "熱心な"] },
          { partOfSpeech: "adjective", pronunciation: "kiːn", texts: ["熱心な", "鋭敏な"] },
        ],
      }),
    );
    expect(result.meanings[0].texts).toEqual(["鋭い", "熱心な", "鋭敏な"]);
  });

  test("統合後の訳語も上限でキャップされる", () => {
    const many = Array.from({ length: WORD_AI_LIMITS.textsPerMeaning + 3 }, (_, i) => ({
      partOfSpeech: "adjective",
      pronunciation: "kiːn",
      texts: [`訳${i}`],
    }));
    const result = normalizeWordAiDraft(draft({ meanings: many }));
    expect(result.meanings).toHaveLength(1);
    expect(result.meanings[0].texts).toHaveLength(WORD_AI_LIMITS.textsPerMeaning);
  });

  test("本文が空の熟語・例文は除去する", () => {
    const result = normalizeWordAiDraft(
      draft({
        phrases: [{ text: "  ", meaning: "無駄に" }],
        sentences: [{ text: "", meaning: "" }],
      }),
    );
    expect(result.phrases).toEqual([]);
    expect(result.sentences).toEqual([]);
  });

  test("件数を上限でキャップする", () => {
    // 発音を変えて統合が起きないようにし、件数キャップだけを検証する
    const meaning = (i: number) => ({
      partOfSpeech: "noun",
      pronunciation: `p${i}`,
      texts: Array.from({ length: WORD_AI_LIMITS.textsPerMeaning + 2 }, (_, j) => `訳${i}-${j}`),
    });
    const example = (i: number) => ({ text: `text ${i}`, meaning: `訳 ${i}` });
    const result = normalizeWordAiDraft(
      draft({
        meanings: Array.from({ length: WORD_AI_LIMITS.meanings + 2 }, (_, i) => meaning(i)),
        phrases: Array.from({ length: WORD_AI_LIMITS.phrases + 2 }, (_, i) => example(i)),
        sentences: Array.from({ length: WORD_AI_LIMITS.sentences + 2 }, (_, i) => example(i)),
      }),
    );
    expect(result.meanings).toHaveLength(WORD_AI_LIMITS.meanings);
    expect(result.meanings[0].texts).toHaveLength(WORD_AI_LIMITS.textsPerMeaning);
    expect(result.phrases).toHaveLength(WORD_AI_LIMITS.phrases);
    expect(result.sentences).toHaveLength(WORD_AI_LIMITS.sentences);
  });
});
