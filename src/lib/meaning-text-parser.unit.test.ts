import { describe, expect, test } from "vitest";

import { type ParsedRelatedWord, parseMeaningText, splitMeaningTexts } from "./meaning-text-parser";

describe("splitMeaningTexts", () => {
  test("トップレベルの ; で分割し trim・空除外する", () => {
    expect(splitMeaningTexts("増加する;を増やす")).toEqual(["増加する", "を増やす"]);
    expect(splitMeaningTexts("  を創り出す ; を引き起こす ")).toEqual([
      "を創り出す",
      "を引き起こす",
    ]);
  });

  test("カッコ内の ; は区切りにしない", () => {
    expect(splitMeaningTexts("（～に;...するのに）十分な（for;to do）")).toEqual([
      "（～に;...するのに）十分な（for;to do）",
    ]);
    expect(splitMeaningTexts("（～に;～のことで）謝る（to;for）;弁明する")).toEqual([
      "（～に;～のことで）謝る（to;for）",
      "弁明する",
    ]);
  });
});

describe("parseMeaningText", () => {
  const onlyMeanings = (raw: string) => parseMeaningText(raw).meaningTexts;
  const onlyRelated = (raw: string): ParsedRelatedWord[] => parseMeaningText(raw).relatedWords;

  test("カッコ無し: 意味のみ・関連語なし", () => {
    expect(parseMeaningText("を創り出す;を引き起こす")).toEqual({
      meaningTexts: ["を創り出す", "を引き起こす"],
      relatedWords: [],
    });
  });

  test("非マーカーのカッコは意味本文に温存する", () => {
    expect(onlyMeanings("を許す;を与える;（～を）考慮に入れる（for）")).toEqual([
      "を許す",
      "を与える",
      "（～を）考慮に入れる（for）",
    ]);
    expect(onlyRelated("（...する）つもりである（to do）")).toEqual([]);
  });

  test("マーカーカッコ外の ⇒ はリンクとして扱わない", () => {
    const r = parseMeaningText("（～に）懐疑的な（of ⇒ about）");
    expect(r.meaningTexts).toEqual(["（～に）懐疑的な（of ⇒ about）"]);
    expect(r.relatedWords).toEqual([]);
  });

  test("≒→SYNONYM / ⇔→ANTONYM、掲載番号リンク", () => {
    expect(parseMeaningText("増加する（⇔ decrease ⇒ 223）;を増やす")).toEqual({
      meaningTexts: ["増加する", "を増やす"],
      relatedWords: [{ kind: "ANTONYM", term: "decrease", meaning: null, linkNumber: 223 }],
    });
    expect(parseMeaningText("に耐える（≒ endure ⇒ 824）;を負う;を産む;を（心に）抱く")).toEqual({
      meaningTexts: ["に耐える", "を負う", "を産む", "を（心に）抱く"],
      relatedWords: [{ kind: "SYNONYM", term: "endure", meaning: null, linkNumber: 824 }],
    });
  });

  test("マーカー直後にスペースが無い場合も解釈する", () => {
    expect(onlyRelated("を秘密にする（⇔uncover ⇒ 1236）")).toEqual([
      { kind: "ANTONYM", term: "uncover", meaning: null, linkNumber: 1236 },
    ]);
  });

  test("リンク無し・訳なし（掲載番号が書かれていない）", () => {
    expect(parseMeaningText("環境（≒ surroundings）")).toEqual({
      meaningTexts: ["環境"],
      relatedWords: [{ kind: "SYNONYM", term: "surroundings", meaning: null, linkNumber: null }],
    });
  });

  test("リンク無し・日本語訳あり", () => {
    expect(parseMeaningText("人工の（⇔ natural 自然の）;不自然な")).toEqual({
      meaningTexts: ["人工の", "不自然な"],
      relatedWords: [{ kind: "ANTONYM", term: "natural", meaning: "自然の", linkNumber: null }],
    });
  });

  test("複数エントリ: 両方リンク", () => {
    expect(onlyRelated("と主張する（≒ claim ⇒ 110, maintain ⇒ 206）;議論する")).toEqual([
      { kind: "SYNONYM", term: "claim", meaning: null, linkNumber: 110 },
      { kind: "SYNONYM", term: "maintain", meaning: null, linkNumber: 206 },
    ]);
  });

  test("複数エントリ: リンク有りと無しの混在", () => {
    expect(onlyRelated("本物の（≒ authentic ⇒ 1580, real）;偽りのない")).toEqual([
      { kind: "SYNONYM", term: "authentic", meaning: null, linkNumber: 1580 },
      { kind: "SYNONYM", term: "real", meaning: null, linkNumber: null },
    ]);
  });

  test("カンマ継続: 訳内のカンマは新エントリにしない", () => {
    expect(onlyRelated("修道士, 僧（⇔ nun 修道女, 尼）")).toEqual([
      { kind: "ANTONYM", term: "nun", meaning: "修道女, 尼", linkNumber: null },
    ]);
    // 意味本文側のカンマは温存（; のみ分割）
    expect(onlyMeanings("修道士, 僧（⇔ nun 修道女, 尼）")).toEqual(["修道士, 僧"]);
  });

  test("連語（熟語）は分割せず term 丸ごと", () => {
    expect(onlyRelated("を確実にする（≒ make sure）;を守る")).toEqual([
      { kind: "SYNONYM", term: "make sure", meaning: null, linkNumber: null },
    ]);
    expect(onlyRelated("～にもかかわらず（≒ in spite of）")).toEqual([
      { kind: "SYNONYM", term: "in spite of", meaning: null, linkNumber: null },
    ]);
    expect(onlyRelated("耳が遠い（≒ hard of hearing）")).toEqual([
      { kind: "SYNONYM", term: "hard of hearing", meaning: null, linkNumber: null },
    ]);
  });

  test("地域ラベルは term に含める", () => {
    expect(onlyRelated("【英】勘定書（≒ 【米】check）")).toEqual([
      { kind: "SYNONYM", term: "【米】check", meaning: null, linkNumber: null },
    ]);
  });

  test("訳にネストした全角カッコがある", () => {
    expect(parseMeaningText("を輸入する（⇔ export （を）輸出する）;を取り込む")).toEqual({
      meaningTexts: ["を輸入する", "を取り込む"],
      relatedWords: [
        { kind: "ANTONYM", term: "export", meaning: "（を）輸出する", linkNumber: null },
      ],
    });
  });

  test("同一セグメントに複数グループ", () => {
    expect(parseMeaningText("を許可する（≒ allow）（⇔ forbid ⇒ 1013）")).toEqual({
      meaningTexts: ["を許可する"],
      relatedWords: [
        { kind: "SYNONYM", term: "allow", meaning: null, linkNumber: null },
        { kind: "ANTONYM", term: "forbid", meaning: null, linkNumber: 1013 },
      ],
    });
  });

  test("意味カッコ＋関連語グループの混在", () => {
    expect(parseMeaningText("致命的な（≒ fatal）;死すべき（運命の）（⇔ immortal 不死の）")).toEqual(
      {
        meaningTexts: ["致命的な", "死すべき（運命の）"],
        relatedWords: [
          { kind: "SYNONYM", term: "fatal", meaning: null, linkNumber: null },
          { kind: "ANTONYM", term: "immortal", meaning: "不死の", linkNumber: null },
        ],
      },
    );
  });

  test("空文字・空白のみ", () => {
    expect(parseMeaningText("")).toEqual({ meaningTexts: [], relatedWords: [] });
    expect(parseMeaningText("   ")).toEqual({ meaningTexts: [], relatedWords: [] });
  });
});
