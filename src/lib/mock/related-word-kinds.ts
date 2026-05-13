export const relatedWordKinds = ["SYNONYM", "ANTONYM", "DERIVATIVE"] as const;

export type RelatedWordKind = (typeof relatedWordKinds)[number];

export const relatedWordKindLabels: Record<RelatedWordKind, string> = {
  SYNONYM: "同意語",
  ANTONYM: "反意語",
  DERIVATIVE: "派生語",
};
