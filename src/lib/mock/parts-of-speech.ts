export type CommonPartOfSpeech = {
  value: string;
  label: string;
  fullLabel: string;
};

export const commonPartsOfSpeech: CommonPartOfSpeech[] = [
  { value: "noun", label: "名", fullLabel: "名詞" },
  { value: "verb", label: "動", fullLabel: "動詞" },
  { value: "adjective", label: "形", fullLabel: "形容詞" },
  { value: "adverb", label: "副", fullLabel: "副詞" },
  { value: "pronoun", label: "代", fullLabel: "代名詞" },
  { value: "preposition", label: "前", fullLabel: "前置詞" },
  { value: "conjunction", label: "接", fullLabel: "接続詞" },
  { value: "interjection", label: "間", fullLabel: "間投詞" },
  { value: "idiom", label: "熟", fullLabel: "熟語" },
];

export const commonPartOfSpeechValues = commonPartsOfSpeech.map((p) => p.value);

export function isCommonPartOfSpeech(value: string): boolean {
  return commonPartOfSpeechValues.includes(value);
}
