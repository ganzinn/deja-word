export const relatedWordKinds = [
  "example",
  "idiom",
  "synonym",
  "antonym",
  "derivative",
] as const;

export type RelatedWordKind = (typeof relatedWordKinds)[number];

export const relatedWordKindLabels: Record<RelatedWordKind, string> = {
  example: "例文",
  idiom: "熟語",
  synonym: "同意語",
  antonym: "反意語",
  derivative: "派生語",
};
