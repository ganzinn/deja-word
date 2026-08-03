// ダミー選択肢の選定（優先順・trim 完全一致の重複排除・縮退判定）。
// 四択（単語単位）と多義語選択（MeaningText 単位）の両方が candidate の型パラメータで使う。

import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import { stripRichTextMarkup } from "@/lib/rich-text";

/**
 * 重複排除・正解一致判定のキー。装飾記法（`**走る**`）を取り除いてから比べる。
 * 除かないと「片方だけ装飾された同じ訳語」が別物と見なされ、画面上は同一文言の選択肢が並ぶ。
 */
function dedupeKey(text: string): string {
  return stripRichTextMarkup(text).trim();
}

/** ダミー候補。`texts` は重複排除に使う表示対象テキスト（trim 前で渡してよい）。 */
export type DummyCandidate<T> = {
  value: T;
  texts: string[];
};

/** 問題生成が成立しない場合（ダミー 0 件等）に投げるエラー。 */
export class QuizGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizGenerationError";
  }
}

type SelectDummiesParams<T> = {
  /** 正解側の全テキスト（trim 前で渡してよい）。これと trim 後完全一致する候補は除外する。 */
  correctTexts: string[];
  /** 優先プール（同一 Occurrence 由来）。 */
  primaryPool: DummyCandidate<T>[];
  /** 補完プール（全登録単語由来）。優先プールで不足した分だけ使う。 */
  fallbackPool: DummyCandidate<T>[];
  desiredCount: number;
  rng: Rng;
};

/**
 * ダミーを最大 `desiredCount` 件選ぶ。
 *
 * - 優先プールから無作為に選び、不足分のみ補完プールから補う（優先プール由来の候補は保持）
 * - 候補のテキストが正解側・選定済みダミーと trim 後完全一致する場合は除外
 * - 不足時はある分まで縮退して返す（縮退の許容範囲は呼び出し側の仕様）
 * - 1 件も選べない場合は {@link QuizGenerationError} を投げる
 */
export function selectDummies<T>(params: SelectDummiesParams<T>): T[] {
  const { correctTexts, primaryPool, fallbackPool, desiredCount, rng } = params;
  const correctSet = new Set(correctTexts.map(dedupeKey));
  const selected: T[] = [];
  const usedTexts = new Set<string>();

  const takeFrom = (pool: DummyCandidate<T>[]) => {
    for (const candidate of fisherYatesShuffle(pool, rng)) {
      if (selected.length >= desiredCount) return;
      const texts = candidate.texts.map(dedupeKey);
      if (texts.some((t) => correctSet.has(t))) continue;
      if (texts.some((t) => usedTexts.has(t))) continue;
      selected.push(candidate.value);
      for (const t of texts) usedTexts.add(t);
    }
  };

  takeFrom(primaryPool);
  if (selected.length < desiredCount) takeFrom(fallbackPool);

  if (selected.length === 0) {
    throw new QuizGenerationError("ダミー選択肢を 1 件も生成できませんでした");
  }
  return selected;
}

/** 正解側テキストと trim 後完全一致しない候補が 1 件でもあるか（成立判定用）。 */
export function hasValidDummyCandidate<T>(
  correctTexts: string[],
  candidates: DummyCandidate<T>[],
): boolean {
  const correctSet = new Set(correctTexts.map(dedupeKey));
  return candidates.some((c) => c.texts.every((t) => !correctSet.has(dedupeKey(t))));
}
