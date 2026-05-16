export const exampleKinds = ["SENTENCE", "PHRASE", "TARGET", "MINIMAL"] as const;

export type ExampleKind = (typeof exampleKinds)[number];

export const exampleKindLabels: Record<ExampleKind, string> = {
  SENTENCE: "例文",
  PHRASE: "成句・熟語",
  TARGET: "TG",
  MINIMAL: "MP",
};
