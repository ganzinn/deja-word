export const exampleKinds = ["PHRASE", "SENTENCE", "TARGET", "MINIMAL"] as const;

export type ExampleKind = (typeof exampleKinds)[number];

export const exampleKindLabels: Record<ExampleKind, string> = {
  PHRASE: "成句・熟語",
  SENTENCE: "例文",
  TARGET: "TG",
  MINIMAL: "MP",
};
